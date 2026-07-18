# -*- coding: utf-8 -*-
"""Monta/atualiza o banco SQLite a partir dos JSONs em data/gold + data/curated.

Idempotente: provas e questões são upsertadas (o histórico de tentativas
é preservado entre reconstruções).
"""
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "data" / "gold"
CURATED = ROOT / "data" / "curated"
DB = ROOT / "data" / "concurso.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS provas (
    id INTEGER PRIMARY KEY,
    chave TEXT UNIQUE NOT NULL,
    banca TEXT NOT NULL,
    ano INTEGER NOT NULL,
    orgao TEXT NOT NULL,
    cargo TEXT NOT NULL,
    tipo TEXT,
    pdf TEXT
);
CREATE TABLE IF NOT EXISTS questoes (
    id INTEGER PRIMARY KEY,
    prova_id INTEGER NOT NULL REFERENCES provas(id),
    numero INTEGER NOT NULL,
    pagina INTEGER,
    disciplina TEXT,
    assunto TEXT,
    texto_apoio TEXT,
    enunciado TEXT NOT NULL,
    alt_a TEXT, alt_b TEXT, alt_c TEXT, alt_d TEXT, alt_e TEXT,
    gabarito TEXT,
    anulada INTEGER NOT NULL DEFAULT 0,
    revisar INTEGER NOT NULL DEFAULT 0,
    imagens TEXT,
    justificativa TEXT,
    UNIQUE (prova_id, numero)
);
CREATE TABLE IF NOT EXISTS tentativas (
    id INTEGER PRIMARY KEY,
    questao_id INTEGER NOT NULL REFERENCES questoes(id),
    resposta TEXT NOT NULL,
    correta INTEGER NOT NULL,
    respondida_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tentativas_questao ON tentativas(questao_id);
"""


def carregar_assuntos(chave: str) -> dict:
    f = CURATED / f"{chave}.assuntos.json"
    if not f.exists():
        return {}
    data = json.loads(f.read_text(encoding="utf-8"))
    return {int(k): v for k, v in data.get("assuntos", {}).items()}


def carregar_justificativas(chave: str) -> dict:
    f = CURATED / f"{chave}.justificativas.json"
    if not f.exists():
        return {}
    data = json.loads(f.read_text(encoding="utf-8"))
    return {int(k): v for k, v in data.get("justificativas", {}).items()}


def main():
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    # migração para bancos criados antes das colunas novas
    cols = {r[1] for r in con.execute("PRAGMA table_info(questoes)")}
    for col in ("imagens", "justificativa"):
        if col not in cols:
            con.execute(f"ALTER TABLE questoes ADD COLUMN {col} TEXT")

    for gold_file in sorted(GOLD.glob("*.json")):
        doc = json.loads(gold_file.read_text(encoding="utf-8"))
        chave = doc["prova"]
        assuntos = carregar_assuntos(chave)
        justificativas = carregar_justificativas(chave)

        con.execute(
            """INSERT INTO provas (chave, banca, ano, orgao, cargo, tipo, pdf)
               VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(chave) DO UPDATE SET banca=excluded.banca,
                 ano=excluded.ano, orgao=excluded.orgao, cargo=excluded.cargo,
                 tipo=excluded.tipo, pdf=excluded.pdf""",
            (chave, doc["banca"], doc["ano"], doc["orgao"], doc["cargo"],
             doc.get("tipo"), doc.get("pdf")))
        prova_id = con.execute(
            "SELECT id FROM provas WHERE chave=?", (chave,)).fetchone()[0]

        for q in doc["questoes"]:
            alts = q["alternativas"]
            con.execute(
                """INSERT INTO questoes (prova_id, numero, pagina, disciplina,
                     assunto, texto_apoio, enunciado,
                     alt_a, alt_b, alt_c, alt_d, alt_e,
                     gabarito, anulada, revisar, imagens, justificativa)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(prova_id, numero) DO UPDATE SET
                     pagina=excluded.pagina, disciplina=excluded.disciplina,
                     assunto=excluded.assunto, texto_apoio=excluded.texto_apoio,
                     enunciado=excluded.enunciado,
                     alt_a=excluded.alt_a, alt_b=excluded.alt_b,
                     alt_c=excluded.alt_c, alt_d=excluded.alt_d,
                     alt_e=excluded.alt_e, gabarito=excluded.gabarito,
                     anulada=excluded.anulada, revisar=excluded.revisar,
                     imagens=excluded.imagens,
                     justificativa=excluded.justificativa""",
                (prova_id, q["numero"], q.get("pagina"), q.get("disciplina"),
                 assuntos.get(q["numero"]), q.get("texto_apoio"), q["enunciado"],
                 alts.get("A"), alts.get("B"), alts.get("C"),
                 alts.get("D"), alts.get("E"),
                 q.get("gabarito"), int(q.get("anulada", False)),
                 int(q.get("revisar", False)),
                 json.dumps(q.get("imagens") or []),
                 justificativas.get(q["numero"])))

        n = con.execute("SELECT COUNT(*) FROM questoes WHERE prova_id=?",
                        (prova_id,)).fetchone()[0]
        print(f"{chave}: {n} questões no banco")

    con.commit()
    con.close()
    print(f"banco pronto: {DB}")


if __name__ == "__main__":
    main()
