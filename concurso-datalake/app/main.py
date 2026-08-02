# -*- coding: utf-8 -*-
"""API de treino de questões. Rodar a partir de concurso-datalake/:

    python -m uvicorn app.main:app --reload
"""
import json
import os
import random
import re
import sqlite3
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "concurso.db"
STATIC = Path(__file__).resolve().parent / "static"

app = FastAPI(title="Treino Concursos")

# intervalos da repetição espaçada (dias até rever a questão, por nº de
# acertos consecutivos desde o último erro; depois disso, "gradua")
INTERVALOS_REVISAO = [1, 3, 7, 15]


def db():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con


def _init_tabelas():
    con = db()
    con.execute("""
        CREATE TABLE IF NOT EXISTS redacoes (
            id INTEGER PRIMARY KEY,
            tema TEXT NOT NULL,
            texto TEXT NOT NULL,
            palavras INTEGER,
            criada_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            correcao TEXT,
            nota REAL
        )""")
    con.commit()
    con.close()


_init_tabelas()


class Resposta(BaseModel):
    questao_id: int
    resposta: str  # A-E


@app.get("/api/filtros")
def filtros():
    con = db()
    provas = [dict(r) for r in con.execute(
        "SELECT id, chave, banca, ano, orgao, cargo, formato "
        "FROM provas ORDER BY ano DESC")]
    disciplinas = [dict(r) for r in con.execute(
        """SELECT disciplina, COUNT(*) AS n FROM questoes
           WHERE gabarito IS NOT NULL GROUP BY disciplina ORDER BY MIN(numero)""")]
    assuntos = [dict(r) for r in con.execute(
        """SELECT disciplina, assunto, COUNT(*) AS n FROM questoes
           WHERE assunto IS NOT NULL AND gabarito IS NOT NULL
           GROUP BY disciplina, assunto ORDER BY assunto""")]
    con.close()
    return {"provas": provas, "disciplinas": disciplinas, "assuntos": assuntos}


@app.get("/api/questoes")
def questoes(prova_id: int | None = None, disciplina: str | None = None,
             assunto: str | None = None, modo: str = "todas",
             limit: int = 100):
    """modo: todas | nao_respondidas | erradas"""
    where = ["q.gabarito IS NOT NULL"]
    params: list = []
    if prova_id:
        where.append("q.prova_id = ?")
        params.append(prova_id)
    if disciplina:
        where.append("q.disciplina = ?")
        params.append(disciplina)
    if assunto:
        where.append("q.assunto = ?")
        params.append(assunto)
    if modo == "nao_respondidas":
        where.append("NOT EXISTS (SELECT 1 FROM tentativas t WHERE t.questao_id = q.id)")
    elif modo == "erradas":
        where.append("""EXISTS (SELECT 1 FROM tentativas t WHERE t.questao_id = q.id
                        AND t.id = (SELECT MAX(t2.id) FROM tentativas t2
                                    WHERE t2.questao_id = q.id)
                        AND t.correta = 0)""")
    sql = f"""
        SELECT q.id, q.numero, q.pagina, q.disciplina, q.assunto, q.texto_apoio,
               q.enunciado, q.alt_a, q.alt_b, q.alt_c, q.alt_d, q.alt_e,
               q.revisar, q.imagens, p.banca, p.ano, p.orgao, p.cargo,
               p.formato, p.pdf
        FROM questoes q JOIN provas p ON p.id = q.prova_id
        WHERE {' AND '.join(where)}
        ORDER BY RANDOM() LIMIT ?"""
    params.append(limit)
    con = db()
    rows = [dict(r) for r in con.execute(sql, params)]
    con.close()
    for r in rows:
        r["imagens"] = json.loads(r["imagens"] or "[]")
    return {"total": len(rows), "questoes": rows}


CAMPOS_QUESTAO = """
        SELECT q.id, q.numero, q.pagina, q.disciplina, q.assunto, q.texto_apoio,
               q.enunciado, q.alt_a, q.alt_b, q.alt_c, q.alt_d, q.alt_e,
               q.revisar, q.imagens, p.banca, p.ano, p.orgao, p.cargo,
               p.formato, p.pdf
        FROM questoes q JOIN provas p ON p.id = q.prova_id"""


def _revisoes_devidas(con):
    """Questões devidas na repetição espaçada: (dias de atraso, questao_id)."""
    rows = con.execute(
        """SELECT questao_id, correta, respondida_em FROM tentativas
           ORDER BY questao_id, id""").fetchall()
    hist = defaultdict(list)
    for r in rows:
        hist[r["questao_id"]].append(r)
    agora = datetime.now()
    devidas = []
    for qid, ts in hist.items():
        if not any(t["correta"] == 0 for t in ts):
            continue                      # nunca errou: fora do ciclo
        streak = 0
        for t in reversed(ts):
            if t["correta"]:
                streak += 1
            else:
                break
        if streak >= len(INTERVALOS_REVISAO):
            continue                      # graduou (acertou 1, 3, 7 e 15 dias)
        ultima = datetime.fromisoformat(ts[-1]["respondida_em"])
        atraso = (agora - ultima).total_seconds() / 86400 \
            - INTERVALOS_REVISAO[streak]
        if atraso >= 0:
            devidas.append((atraso, qid))
    devidas.sort(reverse=True)
    return devidas


@app.get("/api/sessao-do-dia")
def sessao_do_dia(prova_id: int | None = None, disciplina: str | None = None,
                  assunto: str | None = None, limit: int = 25):
    """Monta a sessão diária: revisões espaçadas devidas + questões novas."""
    con = db()
    ids_rev = [qid for _, qid in _revisoes_devidas(con)][:limit]

    questoes = []
    if ids_rev:
        marks = ",".join("?" * len(ids_rev))
        rows = con.execute(
            f"{CAMPOS_QUESTAO} WHERE q.id IN ({marks})", ids_rev).fetchall()
        for r in rows:
            q = dict(r)
            q["imagens"] = json.loads(q["imagens"] or "[]")
            q["origem"] = "revisao"
            questoes.append(q)

    resto = limit - len(questoes)
    if resto > 0:
        where = ["q.gabarito IS NOT NULL",
                 "NOT EXISTS (SELECT 1 FROM tentativas t WHERE t.questao_id = q.id)"]
        params: list = []
        if prova_id:
            where.append("q.prova_id = ?")
            params.append(prova_id)
        if disciplina:
            where.append("q.disciplina = ?")
            params.append(disciplina)
        if assunto:
            where.append("q.assunto = ?")
            params.append(assunto)
        params.append(resto)
        rows = con.execute(
            f"{CAMPOS_QUESTAO} WHERE {' AND '.join(where)} "
            "ORDER BY RANDOM() LIMIT ?", params).fetchall()
        for r in rows:
            q = dict(r)
            q["imagens"] = json.loads(q["imagens"] or "[]")
            q["origem"] = "nova"
            questoes.append(q)
    con.close()
    random.shuffle(questoes)
    n_rev = sum(1 for q in questoes if q["origem"] == "revisao")
    return {"total": len(questoes), "revisoes": n_rev,
            "novas": len(questoes) - n_rev, "questoes": questoes}


@app.get("/api/revisoes-pendentes")
def revisoes_pendentes():
    con = db()
    n = len(_revisoes_devidas(con))
    con.close()
    return {"pendentes": n}


@app.post("/api/responder")
def responder(r: Resposta):
    if r.resposta not in ("A", "B", "C", "D", "E"):
        raise HTTPException(400, "resposta deve ser A-E")
    con = db()
    row = con.execute("SELECT gabarito, justificativa FROM questoes WHERE id=?",
                      (r.questao_id,)).fetchone()
    if row is None or row["gabarito"] is None:
        con.close()
        raise HTTPException(404, "questão não encontrada ou anulada")
    correta = int(r.resposta == row["gabarito"])
    con.execute("INSERT INTO tentativas (questao_id, resposta, correta) VALUES (?,?,?)",
                (r.questao_id, r.resposta, correta))
    con.commit()
    con.close()
    return {"correta": bool(correta), "gabarito": row["gabarito"],
            "justificativa": row["justificativa"]}


@app.get("/api/stats")
def stats():
    con = db()
    por_assunto = [dict(r) for r in con.execute("""
        SELECT q.disciplina, COALESCE(q.assunto, q.disciplina) AS assunto,
               COUNT(t.id) AS tentativas,
               SUM(t.correta) AS acertos,
               COUNT(DISTINCT q.id) AS questoes_respondidas
        FROM tentativas t JOIN questoes q ON q.id = t.questao_id
        GROUP BY q.disciplina, COALESCE(q.assunto, q.disciplina)
        ORDER BY CAST(SUM(t.correta) AS REAL) / COUNT(t.id)""")]
    geral = dict(con.execute("""
        SELECT COUNT(t.id) AS tentativas, COALESCE(SUM(t.correta),0) AS acertos,
               COUNT(DISTINCT t.questao_id) AS questoes_distintas
        FROM tentativas t""").fetchone())
    con.close()
    return {"geral": geral, "por_assunto": por_assunto}


TEMAS_REDACAO = [
    {"id": 1, "titulo": "Inteligência artificial no serviço público",
     "comando": "O uso de inteligência artificial pela administração pública promete eficiência e melhores serviços ao cidadão, mas levanta questões sobre transparência algorítmica, responsabilização por decisões automatizadas e proteção de dados. Considerando esse contexto, redija um texto dissertativo-argumentativo sobre o tema: OPORTUNIDADES E LIMITES DO USO DA INTELIGÊNCIA ARTIFICIAL NA ADMINISTRAÇÃO PÚBLICA BRASILEIRA."},
    {"id": 2, "titulo": "Proteção de dados pessoais (LGPD)",
     "comando": "Desde a vigência da Lei Geral de Proteção de Dados, empresas e órgãos públicos precisam repensar a forma como coletam e tratam dados pessoais, enquanto vazamentos de grandes bases seguem expondo milhões de brasileiros. Redija um texto dissertativo-argumentativo sobre o tema: A PROTEÇÃO DE DADOS PESSOAIS COMO DIREITO FUNDAMENTAL NA SOCIEDADE DA INFORMAÇÃO."},
    {"id": 3, "titulo": "Exclusão digital",
     "comando": "A digitalização acelerada de serviços bancários, educacionais e governamentais trouxe comodidade para muitos, mas deixou para trás parcela expressiva da população sem acesso ou habilidade para usar essas tecnologias. Redija um texto dissertativo-argumentativo sobre o tema: EXCLUSÃO DIGITAL E CIDADANIA: DESAFIOS DA DIGITALIZAÇÃO DOS SERVIÇOS ESSENCIAIS NO BRASIL."},
    {"id": 4, "titulo": "Segurança cibernética nas instituições",
     "comando": "Ataques de ransomware paralisaram sistemas de tribunais, hospitais e empresas estatais brasileiras nos últimos anos, evidenciando a vulnerabilidade das infraestruturas críticas nacionais. Redija um texto dissertativo-argumentativo sobre o tema: SEGURANÇA CIBERNÉTICA COMO CONDIÇÃO PARA A CONTINUIDADE DOS SERVIÇOS PÚBLICOS E PRIVADOS."},
    {"id": 5, "titulo": "Desinformação e redes sociais",
     "comando": "A velocidade de propagação de notícias falsas nas redes sociais desafia instituições, imprensa e cidadãos, com efeitos sobre a saúde pública, as eleições e a confiança social. Redija um texto dissertativo-argumentativo sobre o tema: O COMBATE À DESINFORMAÇÃO ENTRE A LIBERDADE DE EXPRESSÃO E A PROTEÇÃO DA SOCIEDADE."},
    {"id": 6, "titulo": "Trabalho na era da automação",
     "comando": "Estudos apontam que parcela significativa das ocupações atuais pode ser transformada ou substituída pela automação e pela inteligência artificial nas próximas décadas, exigindo requalificação em larga escala. Redija um texto dissertativo-argumentativo sobre o tema: O FUTURO DO TRABALHO DIANTE DA AUTOMAÇÃO: RISCOS, OPORTUNIDADES E O PAPEL DO ESTADO."},
    {"id": 7, "titulo": "Dados abertos e transparência",
     "comando": "Políticas de dados abertos permitem que a sociedade fiscalize gastos e serviços públicos, mas sua implementação esbarra em resistências institucionais e na baixa qualidade das informações publicadas. Redija um texto dissertativo-argumentativo sobre o tema: DADOS ABERTOS GOVERNAMENTAIS COMO INSTRUMENTO DE TRANSPARÊNCIA E CONTROLE SOCIAL."},
    {"id": 8, "titulo": "Seguros, riscos e papel do Estado",
     "comando": "Eventos climáticos extremos, pandemias e crises econômicas reacenderam o debate sobre o papel do Estado e do mercado segurador na proteção de empresas e cidadãos contra riscos crescentes. Redija um texto dissertativo-argumentativo sobre o tema: A GESTÃO DE RISCOS E O PAPEL DAS GARANTIAS PÚBLICAS NO DESENVOLVIMENTO ECONÔMICO."},
    {"id": 9, "titulo": "Ética no uso de algoritmos",
     "comando": "Decisões sobre crédito, contratação e até liberdade condicional vêm sendo apoiadas por algoritmos que podem reproduzir e amplificar vieses históricos presentes nos dados. Redija um texto dissertativo-argumentativo sobre o tema: VIÉS ALGORÍTMICO E JUSTIÇA: COMO GARANTIR DECISÕES AUTOMATIZADAS ÉTICAS E AUDITÁVEIS."},
    {"id": 10, "titulo": "Modernização do Estado",
     "comando": "Programas de governo digital reduziram filas e papelada, mas a transformação digital do Estado exige mais que tecnologia: envolve pessoas, processos e mudança cultural. Redija um texto dissertativo-argumentativo sobre o tema: TRANSFORMAÇÃO DIGITAL DO ESTADO BRASILEIRO: ALÉM DA TECNOLOGIA."},
]

SYSTEM_CORRECAO = (
    "Você é um examinador experiente da banca FCC corrigindo a prova "
    "discursiva (texto dissertativo-argumentativo) de um candidato ao "
    "concurso da ABGF. Corrija com rigor e didática, no padrão FCC.\n"
    "Estruture a correção assim:\n"
    "NOTA: X.X (de 0 a 10)\n\n"
    "Depois, avalie em parágrafos curtos cada critério: (1) conteúdo e "
    "desenvolvimento do tema (pertinência, profundidade, repertório); "
    "(2) estrutura dissertativo-argumentativa (introdução com tese, "
    "desenvolvimento, conclusão); (3) coesão e coerência (conectivos, "
    "progressão); (4) domínio da norma-padrão (aponte cada erro gramatical "
    "encontrado, citando o trecho e a forma correta). Feche com as 3 "
    "melhorias mais importantes para a próxima redação. Responda em texto "
    "corrido, sem markdown."
)


class RedacaoNova(BaseModel):
    tema: str
    texto: str


@app.get("/api/redacao/temas")
def redacao_temas():
    return {"temas": TEMAS_REDACAO}


@app.get("/api/redacoes")
def listar_redacoes():
    con = db()
    rows = [dict(r) for r in con.execute(
        """SELECT id, tema, palavras, criada_em, nota,
                  correcao IS NOT NULL AS corrigida
           FROM redacoes ORDER BY id DESC""")]
    con.close()
    return {"redacoes": rows}


@app.post("/api/redacoes")
def salvar_redacao(r: RedacaoNova):
    texto = r.texto.strip()
    if len(texto) < 50:
        raise HTTPException(400, "texto muito curto para salvar")
    con = db()
    cur = con.execute(
        "INSERT INTO redacoes (tema, texto, palavras) VALUES (?,?,?)",
        (r.tema, texto, len(texto.split())))
    con.commit()
    rid = cur.lastrowid
    con.close()
    return {"id": rid}


@app.get("/api/redacoes/{rid}")
def ver_redacao(rid: int):
    con = db()
    row = con.execute("SELECT * FROM redacoes WHERE id=?", (rid,)).fetchone()
    con.close()
    if row is None:
        raise HTTPException(404, "redação não encontrada")
    return dict(row)


@app.post("/api/redacoes/{rid}/corrigir")
def corrigir_redacao(rid: int):
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(400, (
            "ANTHROPIC_API_KEY não configurada. Feche o servidor, rode "
            "'set ANTHROPIC_API_KEY=sua-chave' no terminal e suba o servidor "
            "de novo para habilitar a correção por IA."))
    con = db()
    row = con.execute("SELECT * FROM redacoes WHERE id=?", (rid,)).fetchone()
    if row is None:
        con.close()
        raise HTTPException(404, "redação não encontrada")
    try:
        import anthropic
        client = anthropic.Anthropic()
        resp = client.messages.create(
            model="claude-opus-4-8",
            max_tokens=4096,
            thinking={"type": "adaptive"},
            system=SYSTEM_CORRECAO,
            messages=[{"role": "user", "content": (
                f"Tema proposto:\n{row['tema']}\n\n"
                f"Redação do candidato:\n{row['texto']}")}],
        )
    except Exception as e:  # rede, chave inválida, lib ausente
        con.close()
        raise HTTPException(502, f"falha na correção: {e}")
    correcao = next(
        (b.text for b in resp.content if b.type == "text"), "").strip()
    m = re.search(r"NOTA:\s*(\d+(?:[.,]\d+)?)", correcao)
    nota = float(m.group(1).replace(",", ".")) if m else None
    con.execute("UPDATE redacoes SET correcao=?, nota=? WHERE id=?",
                (correcao, nota, rid))
    con.commit()
    con.close()
    return {"id": rid, "nota": nota, "correcao": correcao}


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
