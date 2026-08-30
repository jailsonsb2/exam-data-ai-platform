# 🎯 Concurso Data Lake

Sistema pessoal de preparação para concursos que transforma questões previamente processadas em uma plataforma de treino com **FastAPI, SQLite, JavaScript, engenharia de dados e IA**.

O projeto combina pipeline de dados, aplicação web, repetição espaçada, análise de desempenho, justificativas assistidas por IA e treino de redação.

> **Nota sobre os dados:** os PDFs originais de provas, gabaritos e editais não fazem parte deste repositório. O banco e os dados estruturados preservam apenas o material previamente processado utilizado pela aplicação.

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-data-003B57?logo=sqlite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-frontend-F7DF1E?logo=javascript&logoColor=black)

---

## ✨ Funcionalidades

| Recurso | Descrição |
|---|---|
| 🗓️ **Sessão do dia** | Combina revisões de questões erradas com novas questões usando intervalos de 1 → 3 → 7 → 15 dias |
| 🎯 **Sessão manual** | Filtros por prova, disciplina, assunto, estado da questão e quantidade |
| ✅ **Correção imediata** | Feedback instantâneo com o gabarito armazenado |
| 💡 **Justificativas** | Explicações manuais e assistidas por IA para respostas e alternativas |
| 🖼️ **Imagens de apoio** | Questões cujo conteúdo textual é insuficiente podem utilizar imagens previamente processadas |
| ✍️ **Treino de redação** | Temas dissertativos, cronômetro, histórico e avaliação assistida por IA |
| 📊 **Desempenho** | Taxa de acerto por assunto para direcionar o estudo |

---

## 🏗️ Arquitetura

O projeto utiliza uma organização inspirada na **Medallion Architecture**, separando extração, estruturação, curadoria e camada de aplicação.

```text
Dados de origem
      ↓
┌──────────────┐
│    Silver    │  texto e dados intermediários
└──────┬───────┘
       ↓
┌──────────────┐
│     Gold     │  questões estruturadas
└──────┬───────┘
       ↓
┌──────────────┐
│   Curated    │  assuntos e justificativas
└──────┬───────┘
       ↓
┌──────────────┐
│    SQLite    │  questões + histórico do usuário
└──────┬───────┘
       ↓
┌──────────────┐
│   FastAPI    │  API e regras da aplicação
└──────┬───────┘
       ↓
┌──────────────┐
│ Web Frontend │
└──────────────┘
```

### Estrutura principal

```text
concurso-datalake/
├── data/
│   ├── silver/            # dados intermediários
│   ├── gold/              # questões estruturadas
│   ├── curated/           # classificação e justificativas
│   └── concurso.db        # SQLite e histórico de uso
├── scripts/
│   ├── extract_prova.py
│   ├── curate_assuntos.py
│   ├── gen_justificativas.py
│   └── build_db.py
└── app/
    ├── main.py            # API FastAPI
    └── static/            # frontend HTML/CSS/JavaScript
```

---

## 🔄 Pipeline de dados

O pipeline foi criado para transformar documentos de prova em dados estruturados consumíveis pela aplicação.

### Silver

Camada intermediária responsável pela representação do conteúdo extraído e normalizado.

### Gold

Transforma o conteúdo em entidades estruturadas de questão, incluindo campos como prova, disciplina, assunto, alternativas e resposta esperada.

### Curated

Adiciona enriquecimento utilizado pela experiência de estudo, incluindo classificação temática e justificativas.

### Serving / Application

Os dados são consolidados em **SQLite**, que também mantém tentativas, desempenho, ciclos de revisão e redações.

A aplicação expõe essas funcionalidades por meio de uma API **FastAPI** consumida por um frontend web em JavaScript.

---

## 🧩 Engenharia de extração

O pipeline suporta diferentes padrões de documentos e estratégias de parsing.

Entre os problemas tratados estão:

- layouts de uma ou múltiplas colunas;
- textos de apoio associados a grupos de questões;
- diferenças de formatação entre bancas;
- caracteres degradados durante extração/OCR;
- marcadores inconsistentes de questões e alternativas;
- ressincronização do parser quando a estrutura esperada é perdida;
- identificação de questões que exigem revisão ou representação visual.

O objetivo é evitar que uma falha localizada de parsing invalide todo o processamento do documento.

---

## 🧠 Repetição espaçada

Questões respondidas incorretamente entram em um ciclo progressivo de revisão:

```text
Erro
 ↓
1 dia
 ↓
3 dias
 ↓
7 dias
 ↓
15 dias
 ↓
Graduação
```

Uma resposta correta em uma etapa avança a questão para o próximo intervalo. Isso permite que a sessão diária combine automaticamente **revisões pendentes + questões novas**.

---

## 🤖 IA aplicada

A IA é utilizada como camada complementar da aplicação, principalmente para:

- geração de justificativas;
- explicação das alternativas;
- apoio à identificação de pegadinhas;
- avaliação de redações;
- feedback estruturado ao usuário.

Quando necessário, questões com elementos visuais podem utilizar imagens previamente processadas como contexto adicional para o modelo.

A aplicação continua mantendo separação entre **resposta/gabarito armazenado** e **explicação gerada por modelo**, evitando tratar a saída generativa como fonte primária da resposta correta.

---

## 📊 Base estruturada

A base atual contém **670 questões previamente processadas**, provenientes de diferentes provas e áreas, com **661 questões respondíveis**.

Os documentos PDF utilizados originalmente para a extração **não estão incluídos no repositório**.

O projeto mantém os dados estruturados necessários para funcionamento da aplicação e histórico de estudo.

---

## 🚀 Executando localmente

### Dependências

```bash
pip install pdfplumber fastapi "uvicorn[standard]" anthropic
```

### Iniciar a aplicação

```bash
cd concurso-datalake
python -m uvicorn app.main:app --port 8000
```

A aplicação ficará disponível em:

```text
http://127.0.0.1:8000
```

### Recursos de IA

Para funcionalidades que utilizam API externa, configure a chave por variável de ambiente.

Windows:

```powershell
set ANTHROPIC_API_KEY=sua-chave
```

Linux/macOS:

```bash
export ANTHROPIC_API_KEY="sua-chave"
```

Nenhuma chave de API deve ser versionada no repositório.

---

## 💡 Geração de justificativas

O pipeline permite gerar justificativas de forma incremental:

```bash
python scripts/gen_justificativas.py all
python scripts/build_db.py
```

O processamento incremental permite interromper e continuar a geração sem necessariamente reconstruir todo o conjunto desde o início.

---

## 🔧 Tecnologias

**Backend**

- Python
- FastAPI
- SQLite
- REST APIs

**Data Engineering**

- ETL
- Medallion Architecture
- Silver / Gold / Curated layers
- Data normalization
- Data quality
- Structured datasets

**AI**

- LLM integration
- Prompt-based enrichment
- AI-assisted explanations
- AI-assisted essay evaluation

**Frontend**

- JavaScript
- HTML
- CSS

---

## 🎯 Decisões de engenharia

Algumas decisões importantes do projeto:

- separar documentos de origem dos dados consumidos pela aplicação;
- preservar uma camada intermediária antes da estruturação final;
- manter curadoria independente do processo de extração;
- separar gabarito estruturado de explicações generativas;
- preservar o histórico do usuário durante reconstruções do banco;
- tratar erros de parsing de maneira localizada;
- utilizar banco relacional leve para o serving da aplicação;
- manter dados de estudo e regras da aplicação desacoplados da interface.

---

## 🗺️ Roadmap

- [x] Pipeline de extração e estruturação
- [x] Camadas Silver / Gold / Curated
- [x] Aplicação FastAPI
- [x] Frontend web para treino
- [x] Correção imediata
- [x] Repetição espaçada 1/3/7/15 dias
- [x] Análise de desempenho
- [x] Justificativas manuais e assistidas por IA
- [x] Treino de redação com avaliação assistida por IA
- [ ] Pipeline OCR mais robusto para documentos digitalizados
- [ ] Geração controlada de questões inéditas
- [ ] Experimentação do pipeline em ambiente Databricks
- [ ] Mentor de estudos com estado e orquestração baseada em grafo

---

## 🔒 Dados e propriedade intelectual

Este repositório demonstra a arquitetura e a implementação da plataforma de estudo.

Os **PDFs originais de provas, gabaritos e editais não são distribuídos** neste repositório. Marcas, provas e conteúdos de terceiros pertencem aos respectivos titulares.

O projeto é destinado a estudo, experimentação de engenharia de software, engenharia de dados e IA aplicada.

---

## 👨‍💻 Autor

**Jailson Bezerra**

Software Engineering · Automation · Data · AI

- LinkedIn: https://linkedin.com/in/jailsonsb
- Portfolio: https://jailson.es
