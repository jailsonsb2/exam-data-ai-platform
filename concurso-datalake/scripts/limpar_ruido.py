# -*- coding: utf-8 -*-
"""Remove cabeçalho/rodapé de página que vazou para dentro das questões.

    python scripts/limpar_ruido.py [--aplicar]

Sem --aplicar só mostra o que seria removido (padrão seguro).

O extrator quebra a página em blocos de texto e, quando o cabeçalho da prova
cai no meio do fluxo de leitura, ele acaba grudado no fim da última alternativa
antes da quebra de página. Exemplo real (TCE-PI q3):

    (E) punibilidade – impunemente – punição. AUDITOR DE CONTROLE EXTERNO –
        SISTEMAS ENGENHARIA DE DADOS

O que identifica esse lixo não é o texto em si, e sim **repetir igualzinho em
várias questões da mesma prova** — nenhuma alternativa real faz isso. Por isso
a detecção é automática: nada de lista chumbada por prova, o que continuaria
valendo para provas novas.

Depois de aplicar, rode: build_db.py e build_site.py
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "data" / "gold"

# trecho longo em caixa alta: formato típico de cabeçalho de prova
CANDIDATO = re.compile(r"[A-ZÀ-Ú][A-ZÀ-Ú0-9\s–—\-\.\,/]{20,}")
# linhas de tracinhos que sobram de separadores gráficos do PDF
TRACOS = re.compile(r"\s*[-–—_]{8,}\s*")

MIN_PALAVRAS = 4     # frases curtas em caixa alta costumam ser SQL/siglas
MIN_QUESTOES = 3     # repetiu em 3+ questões da prova: é boilerplate


def campos(q: dict):
    """(rótulo, texto) de cada campo textual da questão."""
    yield "texto_apoio", q.get("texto_apoio")
    yield "enunciado", q.get("enunciado")
    for letra, alt in (q.get("alternativas") or {}).items():
        yield f"alt {letra}", alt


def detectar(doc: dict) -> list[str]:
    """Trechos em caixa alta que se repetem em MIN_QUESTOES ou mais."""
    contagem = Counter()
    for q in doc["questoes"]:
        vistos = set()
        for _, txt in campos(q):
            for m in CANDIDATO.finditer(txt or ""):
                s = " ".join(m.group().split())
                if len(s.split()) >= MIN_PALAVRAS:
                    vistos.add(s)
        contagem.update(vistos)
    # o mais longo primeiro, para não remover só um pedaço do cabeçalho
    return sorted([s for s, n in contagem.items() if n >= MIN_QUESTOES],
                  key=len, reverse=True)


def limpar(txt: str, ruidos: list[str]) -> str:
    if not txt:
        return txt
    for r in ruidos:
        # o cabeçalho pode ter sido quebrado em várias linhas pelo PDF
        flex = re.compile(r"\s*" + r"\s+".join(map(re.escape, r.split())) + r"\s*")
        txt = flex.sub(" ", txt)
    txt = TRACOS.sub(" ", txt)
    txt = re.sub(r"[ \t]{2,}", " ", txt)
    txt = re.sub(r" +\n", "\n", txt)
    return txt.strip()


def main():
    aplicar = "--aplicar" in sys.argv
    total_campos = total_questoes = 0

    for arquivo in sorted(GOLD.glob("*.json")):
        doc = json.loads(arquivo.read_text(encoding="utf-8"))
        ruidos = detectar(doc)
        if not ruidos:
            continue

        print(f"\n{doc['prova']}")
        for r in ruidos:
            print(f"  ruído: {r[:80]}")

        mudou_prova = 0
        for q in doc["questoes"]:
            mudou_q = False
            novo_apoio = limpar(q.get("texto_apoio"), ruidos)
            if novo_apoio != q.get("texto_apoio"):
                q["texto_apoio"] = novo_apoio
                mudou_q = True
                total_campos += 1
            novo_enun = limpar(q.get("enunciado"), ruidos)
            if novo_enun != q.get("enunciado"):
                q["enunciado"] = novo_enun
                mudou_q = True
                total_campos += 1
            for letra, alt in list((q.get("alternativas") or {}).items()):
                nova = limpar(alt, ruidos)
                if nova != alt:
                    q["alternativas"][letra] = nova
                    mudou_q = True
                    total_campos += 1
            if mudou_q:
                mudou_prova += 1

        total_questoes += mudou_prova
        print(f"  {mudou_prova} questões afetadas")
        if aplicar and mudou_prova:
            arquivo.write_text(
                json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\n{total_questoes} questões e {total_campos} campos "
          f"{'limpos' if aplicar else 'seriam limpos'}.")
    if not aplicar:
        print("Nada foi alterado. Rode com --aplicar para gravar.")
    elif total_questoes:
        print("Agora rode: python scripts/build_db.py && python scripts/build_site.py")


if __name__ == "__main__":
    main()
