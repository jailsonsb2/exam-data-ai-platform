# -*- coding: utf-8 -*-
"""Gera justificativas das questões via Gemini API e grava na curadoria.

Uso:
    set GEMINI_API_KEY=...
    python scripts/gen_justificativas_gemini.py <chave-da-prova|all> [--max N]

Alternativa ao gen_justificativas.py (Claude) para rodar dentro da cota
gratuita do Gemini. O free tier do gemini-3.1-flash-lite dá 15 RPM e 500
requisições por dia, então o lote completo (645 questões) sai em dois dias:

    python scripts/gen_justificativas_gemini.py all --max 460   # hoje
    python scripts/gen_justificativas_gemini.py all             # amanhã
    python scripts/build_db.py

- Pula questões que já têm justificativa em data/curated/<chave>.justificativas.json
- Questões com imagens (código/fórmula/tabela) são enviadas com o recorte PNG
  para o modelo enxergar o que o texto extraído não captura.
- Grava a cada questão: pode interromper (Ctrl+C) e retomar sem perder nada.
- Ao bater a cota diária (429), para e avisa — rode de novo no dia seguinte.
"""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "data" / "gold"
CURATED = ROOT / "data" / "curated"
IMG = ROOT / "app" / "static"

MODEL = "gemini-3.1-flash-lite"
RPM = 15                      # free tier: 15 requisições por minuto
INTERVALO = 60.0 / RPM + 0.3  # folga para não raspar o limite

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


class CotaDiariaEsgotada(Exception):
    """429 do free tier: nada a fazer hoje, o progresso já está salvo."""


def montar_partes(doc: dict, q: dict) -> list:
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

    partes = []
    for rel in q.get("imagens") or []:
        png = IMG / rel
        if png.exists():
            partes.append({"inline_data": {
                "mime_type": "image/png",
                "data": base64.standard_b64encode(png.read_bytes()).decode()}})
    if partes:
        texto += ("\n\nATENÇÃO: o texto extraído está incompleto; use as imagens "
                  "acima (recorte oficial da prova) como fonte do enunciado.")
    partes.append({"text": texto})
    return partes


def gerar(api_key: str, doc: dict, q: dict, tentativas: int = 3) -> tuple[str, int]:
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{MODEL}:generateContent?key={api_key}")
    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{"role": "user", "parts": montar_partes(doc, q)}],
        "generationConfig": {"maxOutputTokens": 2048, "temperature": 0.3},
    }
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"})

    for n in range(tentativas):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.load(r)
            break
        except urllib.error.HTTPError as e:
            corpo = e.read().decode("utf-8", "replace")
            if e.code == 429:
                # RPM estoura por minuto e se recupera; RPD só no dia seguinte
                if "PerDay" in corpo or "per day" in corpo.lower():
                    raise CotaDiariaEsgotada(corpo[:300])
                espera = 30 * (n + 1)
                print(f"    rate limit por minuto, aguardando {espera}s...")
                time.sleep(espera)
                continue
            if e.code >= 500 and n < tentativas - 1:
                time.sleep(10 * (n + 1))
                continue
            raise RuntimeError(f"HTTP {e.code}: {corpo[:300]}") from e
    else:
        raise RuntimeError("estourou as tentativas de rate limit")

    cand = (d.get("candidates") or [{}])[0]
    partes = cand.get("content", {}).get("parts") or []
    texto = "".join(p.get("text", "") for p in partes).strip()
    tokens = d.get("usageMetadata", {}).get("totalTokenCount", 0)
    return texto, tokens


def processar_prova(api_key: str, gold_file: Path, restante: int) -> int:
    doc = json.loads(gold_file.read_text(encoding="utf-8"))
    chave = doc["prova"]
    cur_path = CURATED / f"{chave}.justificativas.json"
    cur = (json.loads(cur_path.read_text(encoding="utf-8"))
           if cur_path.exists() else {"prova": chave, "justificativas": {}})
    just = cur["justificativas"]

    pendentes = [q for q in doc["questoes"]
                 if q.get("gabarito") is not None and not just.get(str(q["numero"]))]
    total = len([q for q in doc["questoes"] if q.get("gabarito")])
    if not pendentes:
        print(f"{chave}: {len(just)}/{total} — nada pendente")
        return 0

    print(f"\n{chave}: {len(pendentes)} pendentes de {total}")
    feitas = 0
    for q in pendentes:
        if feitas >= restante:
            break
        num = str(q["numero"])
        t0 = time.time()
        try:
            texto, tokens = gerar(api_key, doc, q)
        except CotaDiariaEsgotada:
            raise
        except Exception as e:
            print(f"  q{num}: falhou ({e}) — segue para a próxima")
            continue
        if not texto:
            print(f"  q{num}: resposta vazia, pulando")
            continue
        just[num] = texto
        feitas += 1
        cur_path.write_text(
            json.dumps(cur, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  q{num} ok ({tokens} tokens) [{feitas}/{restante} no lote]")
        # respeita o teto de 15 RPM contando o tempo já gasto na chamada
        pausa = INTERVALO - (time.time() - t0)
        if pausa > 0 and feitas < restante:
            time.sleep(pausa)

    print(f"{chave}: {len(just)}/{total} justificativas")
    return feitas


def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        sys.exit("defina GEMINI_API_KEY antes de rodar "
                 "(set GEMINI_API_KEY=sua-chave)")

    args = sys.argv[1:]
    teto = 460  # cota diária do free tier com folga
    if "--max" in args:
        i = args.index("--max")
        teto = int(args[i + 1])
        del args[i:i + 2]
    chave = args[0] if args else "all"

    arquivos = (sorted(GOLD.glob("*.json")) if chave == "all"
                else [GOLD / f"{chave}.json"])

    feitas = 0
    inicio = time.time()
    try:
        for f in arquivos:
            if feitas >= teto:
                break
            feitas += processar_prova(api_key, f, teto - feitas)
    except CotaDiariaEsgotada:
        print("\nCota diária do free tier esgotada. O progresso está salvo — "
              "rode o mesmo comando amanhã para continuar.")
    except KeyboardInterrupt:
        print("\nInterrompido. O progresso está salvo.")

    mins = (time.time() - inicio) / 60
    print(f"\n{feitas} justificativas geradas em {mins:.1f} min.")
    if feitas:
        print("Agora rode: python scripts/build_db.py")


if __name__ == "__main__":
    main()
