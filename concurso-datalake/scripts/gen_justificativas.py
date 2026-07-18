# -*- coding: utf-8 -*-
"""Gera justificativas das questões via Claude API e grava na curadoria.

Uso:
    set ANTHROPIC_API_KEY=...   (ou `ant auth login`)
    python scripts/gen_justificativas.py <chave-da-prova|all> [--limit N]

- Pula questões que já têm justificativa em data/curated/<chave>.justificativas.json
- Questões com imagens (código/fórmula/tabela) são enviadas com o recorte PNG
  para o modelo enxergar o conteúdo que o texto extraído não captura.
- Grava incrementalmente: pode interromper e retomar.
Depois rode: python scripts/build_db.py
"""
import base64
import json
import sys
from pathlib import Path

import anthropic

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "data" / "gold"
CURATED = ROOT / "data" / "curated"
IMG = ROOT / "app" / "static"

MODEL = "claude-opus-4-8"

SYSTEM = (
    "Você é um professor especialista em concursos públicos de TI (bancas FGV e "
    "FCC), explicando questões para um aluno que estuda para Dataprev e ABGF.\n"
    "Para cada questão, escreva uma justificativa em português com 3 a 6 frases:\n"
    "1) explique por que a alternativa do gabarito está correta (o conceito por trás);\n"
    "2) aponte a pegadinha ou o erro das distratoras mais tentadoras;\n"
    "3) se houver conta, mostre o cálculo de forma compacta em texto plano "
    "(sem LaTeX).\n"
    "Não repita o enunciado. Não use markdown nem títulos. Responda apenas com o "
    "texto da justificativa."
)


def montar_conteudo(doc: dict, q: dict) -> list:
    texto = (
        f"Prova: {doc['banca']} {doc['ano']} - {doc['orgao']} - {doc['cargo']}\n"
        f"Questão {q['numero']} | Disciplina: {q.get('disciplina')}\n\n"
    )
    if q.get("texto_apoio"):
        texto += f"Texto de apoio:\n{q['texto_apoio']}\n\n"
    texto += f"Enunciado:\n{q['enunciado']}\n\nAlternativas:\n"
    for letra, alt in q["alternativas"].items():
        texto += f"({letra}) {alt}\n"
    texto += f"\nGabarito oficial: ({q['gabarito']})"

    conteudo = []
    for rel in q.get("imagens") or []:
        png = IMG / rel
        if png.exists():
            conteudo.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": base64.standard_b64encode(png.read_bytes()).decode(),
                },
            })
    if conteudo:
        texto += ("\n\nATENÇÃO: o texto extraído está incompleto; use as imagens "
                  "acima (recorte oficial da prova) como fonte do enunciado.")
    conteudo.append({"type": "text", "text": texto})
    return conteudo


def processar_prova(client: anthropic.Anthropic, gold_file: Path, limit: int) -> int:
    doc = json.loads(gold_file.read_text(encoding="utf-8"))
    chave = doc["prova"]
    cur_path = CURATED / f"{chave}.justificativas.json"
    cur = (json.loads(cur_path.read_text(encoding="utf-8"))
           if cur_path.exists() else {"prova": chave, "justificativas": {}})
    just = cur["justificativas"]

    feitas = 0
    for q in doc["questoes"]:
        if limit and feitas >= limit:
            break
        num = str(q["numero"])
        if q.get("gabarito") is None or just.get(num):
            continue
        try:
            resp = client.messages.create(
                model=MODEL,
                max_tokens=2048,
                thinking={"type": "adaptive"},
                system=SYSTEM,
                messages=[{"role": "user", "content": montar_conteudo(doc, q)}],
            )
        except anthropic.RateLimitError:
            print("rate limit — aguarde e rode de novo (progresso está salvo)")
            break
        texto = next((b.text for b in resp.content if b.type == "text"), "").strip()
        if not texto:
            print(f"  q{num}: resposta vazia, pulando")
            continue
        just[num] = texto
        feitas += 1
        cur_path.write_text(
            json.dumps(cur, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  q{num} ok ({resp.usage.output_tokens} tokens)")

    total = len([q for q in doc["questoes"] if q.get("gabarito")])
    print(f"{chave}: {len(just)}/{total} justificativas")
    return feitas


def main():
    args = sys.argv[1:]
    limit = 0
    if "--limit" in args:
        i = args.index("--limit")
        limit = int(args[i + 1])
        del args[i:i + 2]
    chave = args[0] if args else "all"

    client = anthropic.Anthropic()
    arquivos = (sorted(GOLD.glob("*.json")) if chave == "all"
                else [GOLD / f"{chave}.json"])
    for f in arquivos:
        processar_prova(client, f, limit)


if __name__ == "__main__":
    main()
