# -*- coding: utf-8 -*-
"""Gera o site estático (pasta site/) que a Netlify publica.

    python scripts/build_site.py

Lê data/concurso.db e web/ e escreve tudo em site/:

    site/index.html, app.js, style.css, sw.js, manifest.webmanifest
    site/dados/questoes.json   ← questões, gabarito e justificativas
    site/img/...               ← recortes de PDF das questões com imagem

O site não tem servidor: o histórico de respostas, a repetição espaçada e as
redações ficam no localStorage do próprio celular. As tentativas já existentes
no SQLite viajam junto (campo `tentativas_iniciais`) e são semeadas no primeiro
acesso, para não perder o histórico feito no PC.
"""
import json
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "concurso.db"
WEB = ROOT / "web"
IMG_SRC = ROOT / "app" / "static" / "img"
OUT = ROOT / "site"

# os temas moram no backend FastAPI; o site estático precisa deles embutidos
sys.path.insert(0, str(ROOT))


def carregar_temas() -> list:
    """Reaproveita a lista de temas do app FastAPI, sem subir o servidor."""
    import ast
    fonte = (ROOT / "app" / "main.py").read_text(encoding="utf-8")
    arvore = ast.parse(fonte)
    for no in arvore.body:
        if isinstance(no, ast.Assign) and any(
                getattr(t, "id", None) == "TEMAS_REDACAO" for t in no.targets):
            return ast.literal_eval(no.value)
    raise SystemExit("TEMAS_REDACAO não encontrado em app/main.py")


def exportar_dados() -> dict:
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    provas = [dict(r) for r in con.execute(
        """SELECT id, chave, banca, ano, orgao, cargo, pdf
           FROM provas ORDER BY ano DESC, orgao""")]

    questoes = []
    descartadas = []
    for r in con.execute("""
            SELECT id, prova_id, numero, pagina, disciplina, assunto,
                   texto_apoio, enunciado, alt_a, alt_b, alt_c, alt_d, alt_e,
                   gabarito, revisar, imagens, justificativa
            FROM questoes WHERE gabarito IS NOT NULL
            ORDER BY prova_id, numero"""):
        q = dict(r)
        alts = {}
        for letra in "abcde":
            valor = q.pop(f"alt_{letra}")
            if valor:
                alts[letra.upper()] = valor
        q["alts"] = alts
        q["imagens"] = json.loads(q["imagens"] or "[]")
        q["revisar"] = bool(q["revisar"])
        # campos vazios só engordam o JSON que o celular baixa
        for chave in ("texto_apoio", "assunto", "justificativa"):
            if not q.get(chave):
                q.pop(chave, None)
        # sem texto das alternativas e sem recorte do PDF não há como responder:
        # o gabarito existe, mas nada na tela representa a alternativa certa
        if not alts and not q["imagens"]:
            descartadas.append((q["prova_id"], q["numero"]))
            continue

        if not q["imagens"]:
            q.pop("imagens")
        if not q["revisar"]:
            q.pop("revisar")
        questoes.append(q)

    tentativas = [dict(r) for r in con.execute(
        """SELECT questao_id, resposta, correta, respondida_em
           FROM tentativas ORDER BY id""")]
    con.close()

    if descartadas:
        chaves = {p["id"]: p["chave"] for p in provas}
        print("questões fora do site (nem texto das alternativas, nem recorte):")
        for prova_id, numero in descartadas:
            print(f"  {chaves.get(prova_id, prova_id)} q{numero}")

    return {
        "gerado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "provas": provas,
        "questoes": questoes,
        "tentativas_iniciais": tentativas,
        "temas_redacao": carregar_temas(),
    }


def main():
    if not DB.exists():
        raise SystemExit(f"banco não encontrado: {DB} — rode build_db.py antes")
    if not WEB.exists():
        raise SystemExit(f"fontes do site não encontradas: {WEB}")

    # esvazia o conteúdo em vez de apagar a própria pasta: no Windows (ainda
    # mais com o OneDrive sincronizando) remover o diretório raiz falha se
    # algum processo estiver com ele aberto
    OUT.mkdir(parents=True, exist_ok=True)
    for item in OUT.iterdir():
        if item.is_dir():
            shutil.rmtree(item, ignore_errors=True)
        else:
            item.unlink(missing_ok=True)

    # carimba a geração no service worker: é o que invalida o cache do celular
    versao = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    for f in WEB.iterdir():
        if not f.is_file():
            continue
        if f.name == "sw.js":
            (OUT / f.name).write_text(
                f.read_text(encoding="utf-8").replace("__VERSAO__", versao),
                encoding="utf-8")
        else:
            shutil.copy2(f, OUT / f.name)

    dados = exportar_dados()
    (OUT / "dados").mkdir()
    destino = OUT / "dados" / "questoes.json"
    destino.write_text(
        json.dumps(dados, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")

    if IMG_SRC.exists():
        shutil.copytree(IMG_SRC, OUT / "img")

    n_img = sum(1 for _ in (OUT / "img").rglob("*.png")) if (OUT / "img").exists() else 0
    tam_json = destino.stat().st_size / 1024
    tam_img = sum(f.stat().st_size for f in (OUT / "img").rglob("*")
                  if f.is_file()) / 1024 / 1024 if (OUT / "img").exists() else 0
    com_just = sum(1 for q in dados["questoes"] if q.get("justificativa"))

    print(f"site gerado em {OUT} (versão {versao})")
    print(f"  {len(dados['questoes'])} questões ({com_just} com justificativa)")
    print(f"  {len(dados['provas'])} provas · {len(dados['temas_redacao'])} temas de redação")
    print(f"  {len(dados['tentativas_iniciais'])} tentativas do histórico local")
    print(f"  questoes.json: {tam_json:.0f} KB · {n_img} imagens: {tam_img:.1f} MB")


if __name__ == "__main__":
    main()
