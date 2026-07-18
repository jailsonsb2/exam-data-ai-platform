# -*- coding: utf-8 -*-
"""Taguea assunto por questão via palavras-chave, para as disciplinas de dados.

Mescla com a curadoria existente em data/curated/<chave>.assuntos.json sem
sobrescrever tags já definidas (manuais). Rode depois de extract_prova.py.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLD = ROOT / "data" / "gold"
CURATED = ROOT / "data" / "curated"

# disciplinas em que a tag fina de assunto faz sentido
DISCIPLINAS_DADOS = re.compile(
    r"Ci[êe]ncia de Dados|Matem[áa]tica e Estat[íi]stica|Engenharia de Dados"
    r"|TI - Sistemas|Tecnologia da Informa[çc][ãa]o|^Estat[íi]stica$", re.I)

# ordem importa: a primeira regra que casar define o assunto
REGRAS = [
    (r"\bk-?means\b|agrupamento|clusteriza|\bcluster", "ML - Clustering"),
    (r"\bPCA\b|componentes principais|redu[çc][ãa]o de dimensionalidade|t-SNE",
     "ML - Redução de Dimensionalidade"),
    (r"\bSVM\b|support vector|vetores de suporte", "ML - SVM"),
    (r"k-?NN\b|vizinhos mais pr[óo]ximos", "ML - k-NN"),
    (r"[áa]rvores? de decis[ãa]o|random forest|floresta aleat[óo]ria|boosting|XGBoost|ensemble",
     "ML - Árvores e Ensembles"),
    (r"\bCNN\b|convolucion", "Deep Learning - CNN"),
    (r"\bLSTM\b|\bRNN\b|rede.{0,20}recorrente", "Deep Learning - RNN/LSTM"),
    (r"transformer|mecanismo de aten[çc][ãa]o|\bBERT\b|\bGPT\b|\bLLM\b|IA generativa",
     "NLP - Transformers e LLMs"),
    (r"linguagem natural|\bNLP\b|\bPLN\b|nltk|tokeniz|stemming|lematiza|bag of words|TF-?IDF",
     "NLP - Processamento de Linguagem Natural"),
    (r"gradiente descendente|gradient descent|backpropagation|retropropaga|taxa de aprendizado|hiperpar[âa]metro",
     "Redes Neurais - Treinamento e Otimização"),
    (r"rede neural|neur[ôo]nio|perceptron|fun[çc][ãa]o de ativa[çc][ãa]o|keras|tensorflow|pytorch|deep learning",
     "Redes Neurais"),
    (r"overfitting|sobreajuste|underfitting|regulariza|valida[çc][ãa]o cruzada|cross-?validation|generaliza[çc][ãa]o|treino e teste",
     "ML - Validação e Regularização"),
    (r"matriz de confus[ãa]o|acur[áa]cia|precis[ãa]o e recall|\brecall\b|F1|curva ROC|\bAUC\b",
     "ML - Métricas de Avaliação"),
    (r"aprendizado (supervisionado|n[ãa]o supervisionado|semissupervisionado|por refor[çc]o)|aprendizado de m[áa]quina",
     "ML - Paradigmas de Aprendizado"),
    (r"regress[ãa]o (linear|log[íi]stica)|m[íi]nimos quadrados", "ML - Regressão"),
    (r"regras? de associa[çc][ãa]o|apriori|minera[çc][ãa]o de dados", "Mineração de Dados"),
    (r"pandas|numpy|matplotlib|scikit|seaborn|DataFrame|c[óo]digo (em )?Python|Python", "Python para Dados"),
    (r"linguagem R\b|c[óo]digo (em )?R\b|ggplot|dplyr|tidyverse|data\.frame|neuralnet", "Linguagem R"),
    (r"data warehouse|OLAP|esquema estrela|floco de neve|dimensional|tabela de fatos?|drill|data mart",
     "DW e Modelagem Dimensional"),
    (r"\bETL\b|\bELT\b|pipeline de dados|ingest[ãa]o", "Engenharia de Dados - ETL/Pipelines"),
    (r"hadoop|spark|mapreduce|big data|\bhive\b|kafka|streaming", "Big Data"),
    (r"NoSQL|MongoDB|Cassandra|chave-valor|orientado a (documentos|grafos)|sharding",
     "NoSQL"),
    (r"data lake|lakehouse|governan[çc]a de dados|cat[áa]logo de dados|qualidade de dados|metadados|data mesh|\bDAMA\b|\bLGPD\b",
     "Governança e Arquitetura de Dados"),
    (r"normaliza[çc][ãa]o|forma normal|modelo relacional|chave (prim[áa]ria|estrangeira)|\bSQL\b|SELECT|JOIN|[íi]ndice|transa[çc][ãa]o|\bACID\b",
     "Banco de Dados e SQL"),
    (r"s[ée]rie temporal|ARIMA|sazonalidade", "Séries Temporais"),
    (r"probabilidade|distribui[çc][ãa]o (normal|binomial|de Poisson)|vari[âa]ncia|desvio.padr[ãa]o|m[ée]dia|mediana|teste de hip[óo]tese|amostra|estimador|intervalo de confian[çc]a|correla[çc][ãa]o|Bayes|vari[áa]vel aleat[óo]ria",
     "Estatística e Probabilidade"),
    (r"matriz|autovalor|autovetor|transforma[çc][ãa]o linear|derivada|integral|\blimite\b|gradiente|vetor",
     "Matemática (Álgebra/Cálculo)"),
    (r"visualiza[çc][ãa]o de dados|dashboard|storytelling|Power BI|Tableau", "Visualização de Dados"),
    (r"nuvem|cloud|AWS|Azure|GCP|docker|kubernetes|cont[êe]iner|devops|\bAPI\b|microsservi",
     "Infra, Cloud e APIs"),
    (r"[ée]tica|vi[ée]s algor[íi]tmico|explicabilidade|XAI", "Ética e IA Responsável"),
]
REGRAS = [(re.compile(p, re.I), a) for p, a in REGRAS]


def main():
    CURATED.mkdir(parents=True, exist_ok=True)
    for gold_file in sorted(GOLD.glob("*.json")):
        doc = json.loads(gold_file.read_text(encoding="utf-8"))
        chave = doc["prova"]
        cur_path = CURATED / f"{chave}.assuntos.json"
        cur = (json.loads(cur_path.read_text(encoding="utf-8"))
               if cur_path.exists() else {"prova": chave, "assuntos": {}})
        assuntos = cur["assuntos"]

        alvo = sem_tag = novos = 0
        for q in doc["questoes"]:
            disc = q.get("disciplina") or ""
            if not DISCIPLINAS_DADOS.search(disc):
                continue
            alvo += 1
            k = str(q["numero"])
            if assuntos.get(k):
                continue  # curadoria manual prevalece
            texto = " ".join([q["enunciado"]]
                             + list(q["alternativas"].values())
                             + ([q["texto_apoio"]] if q.get("texto_apoio") else []))
            for rx, assunto in REGRAS:
                if rx.search(texto):
                    assuntos[k] = assunto
                    novos += 1
                    break
            else:
                sem_tag += 1

        cur_path.write_text(
            json.dumps(cur, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{chave}: {alvo} questões de dados, +{novos} tags novas, "
              f"{sem_tag} sem tag")


if __name__ == "__main__":
    main()
