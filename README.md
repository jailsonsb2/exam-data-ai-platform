# 🎯 Concurso Data Lake

> Sistema pessoal de treino com **questões reais de concurso** (FGV e FCC),
> repetição espaçada, justificativas por IA e treino de redação — focado nos
> cargos **Dataprev — Perfil 4 / Inteligência da Informação (FGV)** e
> **ABGF — E05 (FCC)**.

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-data-003B57?logo=sqlite&logoColor=white)
![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-frontend-F7DF1E?logo=javascript&logoColor=black)

**670 questões** extraídas de 9 provas reais (2023–2026), com gabarito
oficial, tagueadas por disciplina e assunto, prontas para treinar no
navegador.

---

## ✨ Funcionalidades

| | |
|---|---|
| 🗓️ **Sessão do dia** | Um clique monta a sessão: revisão espaçada das questões erradas (1 → 3 → 7 → 15 dias) + questões novas |
| 🎯 **Sessão manual** | Filtre por prova, disciplina, assunto e modo (todas / não respondidas / só as que errei) |
| ✅ **Correção imediata** | Verde/vermelho na hora, com o gabarito oficial da banca |
| 💡 **Justificativas** | Por que o gabarito está certo e qual a pegadinha das distratoras (manuais + geradas por IA) |
| 🖼️ **Recortes do PDF** | Questões com código, fórmula ou tabela mostram a imagem original da prova |
| ✍️ **Treino de redação** | 10 temas dissertativos estilo FCC, cronômetro de 60 min, histórico e correção por IA (nota 0–10) |
| 📊 **Desempenho** | Taxa de acerto por assunto, do pior para o melhor — te diz o que estudar |

---

## 🚀 Como rodar

```powershell
# 1. dependências (uma vez)
pip install pdfplumber fastapi "uvicorn[standard]" anthropic

# 2. subir o app
cd concurso-datalake
python -m uvicorn app.main:app --port 8000
```

Abra **http://127.0.0.1:8000** no navegador. Deixe o terminal aberto
enquanto estuda — é ele que mantém o app no ar.

> 💡 Para habilitar as correções por IA (justificativas em lote e correção
> de redação), configure a chave antes de subir o servidor:
> `set ANTHROPIC_API_KEY=sua-chave`

---

## 📖 Como usar

### 1. Sessão do dia (recomendado)

Card azul no topo da tela **Treinar** → **Começar**. A sessão se monta
sozinha:

1. **Primeiro entram as revisões devidas** — questão errada volta em
   **1 dia**; acertando a revisão, volta em **3**, **7** e **15 dias**;
   vencendo as quatro etapas, ela "gradua" e sai do ciclo. Questão acertada
   de primeira nunca entra no ciclo.
2. **O resto completa com questões novas** (os filtros de prova/disciplina/
   assunto valem para essa parte, se você quiser direcionar).
3. Questões de revisão aparecem com **🔁** no cabeçalho.

### 2. Sessão manual

Escolha **Prova** (ex.: FGV Dataprev, FCC TRT-15), **Disciplina** (ex.:
Ciência de Dados e Machine Learning), **Assunto** (ex.: ML - SVM),
**Modo** e **Quantidade** → **Iniciar sessão**.

### 3. Respondendo

- Clique na alternativa → correção na hora + justificativa (quando existe).
- Questões com **⚠️/imagem**: leia o enunciado pelo recorte do PDF — são as
  questões com código, fórmula, tabela ou OCR ruim da FCC.
- **Encerrar sessão** mostra o resumo; **Desempenho** acumula tudo.

### 4. Redação (discursiva FCC)

Aba **Redação** → escolha um dos 10 temas → **▶ Cronômetro** (60 min, como
na prova) → escreva (alvo FCC: 20–30 linhas; o contador estima as linhas)
→ **Salvar redação**. Clique numa redação da lista para reler ou **Corrigir
com IA**: nota 0–10 no padrão FCC, análise por critério (conteúdo,
estrutura dissertativa, coesão, norma culta com cada erro citado e
corrigido) e as 3 melhorias prioritárias.

### 5. Desempenho

% de acerto por assunto, ordenado do pior para o melhor. Use assim:
- **Assunto vermelho recorrente** → 20–30 min de teoria focada + voltar às questões.
- **Assunto que nem aparece** → conferir no edital se existe e buscar material.

---

## 🧠 O método (por que treinar assim funciona)

Este app aplica os dois efeitos mais bem documentados da ciência da
aprendizagem:

- **Prática de recuperação (testing effect)** — tentar responder fixa muito
  mais que reler PDF ou assistir aula. Errar e receber o feedback imediato
  cria memória mais forte do que acertar de primeira.
- **Repetição espaçada** — rever a questão errada nos intervalos 1/3/7/15
  dias interrompe a curva do esquecimento no momento certo.

**Rotina sugerida:**

| Frequência | Atividade |
|---|---|
| Diária (20–40 min) | **Sessão do dia** com 20–30 questões |
| Ao errar | Ler a justificativa **ativamente** (entender a pegadinha, não só assentir) |
| Erro repetido no mesmo assunto | 20–30 min de teoria focada, depois voltar às questões |
| 1x por semana | **Redação** com cronômetro + correção por IA |

⚠️ Questões não cobrem o edital sozinhas: o que nunca caiu nessas 9 provas
você nunca vai errar aqui. Cruze a aba Desempenho com o edital de tempos em
tempos.

---

## 🏗️ Arquitetura (medallion)

```
PROVAS CONCURSO/               ← bronze: PDFs originais (provas + gabaritos + editais)
└── concurso-datalake/
    ├── data/
    │   ├── silver/            ← texto extraído dos PDFs, em ordem de leitura
    │   ├── gold/              ← questões estruturadas em JSON (com gabarito oficial)
    │   ├── curated/           ← curadoria: assuntos e justificativas por questão
    │   └── concurso.db        ← SQLite: provas, questões, tentativas, redações
    ├── scripts/
    │   ├── extract_prova.py       ← PDF → silver → gold (config por prova no dict PROVAS)
    │   ├── curate_assuntos.py     ← tags de assunto por palavra-chave (manual prevalece)
    │   ├── gen_justificativas.py  ← justificativas em lote via Claude API
    │   └── build_db.py            ← gold + curated → SQLite (preserva o histórico)
    └── app/
        ├── main.py            ← API FastAPI
        └── static/            ← frontend vanilla JS/HTML/CSS
```

O extrator tem dois estilos de parse:

- **`fgv`** — duas colunas, número da questão em linha própria, textos de
  apoio "Use the following TEXT..." atribuídos às próximas N questões.
- **`fcc`** — coluna única, número "N." inline, blocos "Atenção: ...
  questões X a Y" como texto de apoio por faixa, e **tolerância a OCR**:
  mapas de confusão de dígitos/letras ("?." = 7, "(6)" = (C)), número sem
  ponto, e ressincronização quando o marcador da questão se perde — questões
  com defeito residual ganham flag `revisar` + recorte PNG, nada fica
  intreinável.

---

## 📚 Provas no banco

| Prova | Questões | Bloco de dados/TI |
|---|---|---|
| FGV 2024 · Dataprev · ATI Inteligência da Informação | 70 (3 anuladas) | q41–70 |
| FGV 2024 · CVM · Analista Perfil 7 Ciência de Dados | 70 (2 anuladas) | q1–70 |
| FGV 2024 · EPE · Analista TI Ciência de Dados | 80 (2 anuladas) | q36–80 |
| FGV 2024 · TJ-RR · Ciência de Dados e Analytics | 70 | q31–70 |
| FGV 2025 · TCE-PI · Auditor TI/Eng. Dados/Ciência de Dados | 100 (2 anuladas) | q66–100 |
| FGV 2026 · ALEGO · Analista de Ciência de Dados | 70 | q41–70 |
| FCC 2023 · TRT-15 · Analista Judiciário TI (Tipo 2) | 60 | q21–60 |
| FCC 2023 · TRT-18 · Analista Judiciário Área Judiciária | 60 | (Direito) |
| FCC 2025 · Prefeitura de SP · Analista TIC | 90 | q21–90 |

**Total: 670 questões (661 respondíveis).**

### Provas pendentes (não extraídas)

| Prova | Motivo |
|---|---|
| MPE-PB 2024 · Administrador de BD | O gabarito no repositório é do cargo errado (B02-Desenvolvedor; a prova é A01-Admin BD). Baixar o gabarito certo e configurar. |
| TRT-12 2023 · TI | Camada de texto com OCR muito degradado — requer OCR novo (Tesseract). |
| TRT-21 2023 · TI | PDF escaneado sem camada de texto — requer OCR. |
| TRF-4 2025 · Análise de Sistemas | PDF escaneado sem camada de texto — requer OCR. |
| SEFAZ-SP 2026 · AFRE TIC | PDF escaneado sem camada de texto — requer OCR. |

---

## 💡 Justificativas por IA

O bloco de Ciência de Dados/ML e Matemática da Dataprev (q41–70) tem
justificativas **escritas e revisadas manualmente**. Para gerar as demais em
lote:

```powershell
set ANTHROPIC_API_KEY=sua-chave
python scripts/gen_justificativas.py all     # incremental: pode interromper e retomar
python scripts/build_db.py
```

Questões com código/fórmula são enviadas **com o recorte PNG da prova**,
para o modelo ler o que a extração de texto não captura.

---

## ➕ Adicionando uma nova prova

1. Coloque o PDF da prova e do gabarito na pasta raiz.
2. Adicione a entrada no dict `PROVAS` em `scripts/extract_prova.py`
   (arquivo, gabarito oficial, estilo `fgv`/`fcc`, faixas de disciplina,
   padrões de ruído).
3. `python scripts/extract_prova.py <chave-da-prova>` — confira a validação
   e o JSON em `data/gold/`.
4. `python scripts/curate_assuntos.py` (tags automáticas; curadoria manual
   prevalece).
5. Opcional: `python scripts/gen_justificativas.py <chave>`.
6. `python scripts/build_db.py` — preserva todo o histórico de tentativas.

---

## 🗺️ Roadmap

- [x] Extração FGV (6 provas) e FCC (3 provas) com validação de gabarito
- [x] App de treino com filtros, correção imediata e recortes de PDF
- [x] Justificativas (manuais + geração em lote via Claude API)
- [x] Sessão do dia com repetição espaçada (1/3/7/15 dias)
- [x] Treino de redação discursiva FCC com correção por IA
- [ ] OCR (Tesseract) para as provas escaneadas pendentes
- [ ] Geração de questões inéditas ancoradas nas reais (mentor "engenharia reversa")
- [ ] Case Databricks: replicar o pipeline medallion (bronze/silver/gold) no Free Edition
- [ ] Mentor de estudos com LangGraph (agente com estado sobre o banco de questões)

---

## ⚖️ Aviso

Provas e gabaritos são de titularidade das respectivas bancas (FGV, FCC) e
órgãos. Este projeto é **pessoal e privado**, para fins exclusivos de
estudo. Não redistribua o conteúdo das provas.
