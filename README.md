# 🎯 Exam Data & AI Platform

### Data Engineering · Backend · Applied AI · Learning Systems

A full-stack learning platform that transforms semi-structured exam content into structured data, adaptive study workflows and AI-assisted feedback.

Built with **Python, FastAPI, SQLite and JavaScript**, the project combines document processing, ETL, Medallion-inspired data layers, backend APIs, spaced repetition, performance analytics and LLM integration in a single working application.

> **Data note:** in the original pipeline, the **Bronze layer is composed of the source PDFs** (exam papers, answer keys and public notices) preserved in their raw form. Those original PDFs are intentionally **not distributed in this public repository**. The repository keeps the processed layers and application data required to demonstrate the architecture and run the platform.

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-data-003B57?logo=sqlite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-frontend-F7DF1E?logo=javascript&logoColor=black)
![AI](https://img.shields.io/badge/Applied_AI-LLM-8A2BE2)

---

## 🚀 What This Project Demonstrates

This repository is more than a study application. It is an end-to-end engineering project covering:

- **Document processing** for heterogeneous and imperfect source formats
- **Data Engineering** with Bronze, Silver, Gold and Curated layers
- **ETL and data quality** for semi-structured content
- **Backend Engineering** with Python and FastAPI
- **Relational serving** and user-state persistence with SQLite
- **Applied AI / LLM integration** for enrichment and structured feedback
- **Learning algorithms** through spaced repetition
- **Frontend development** with JavaScript, HTML and CSS
- **Product engineering** around a real personal use case

---

## ✨ Features

| Feature | Description |
|---|---|
| 🗓️ **Daily Session** | Combines due reviews with new questions using 1 → 3 → 7 → 15 day intervals |
| 🎯 **Custom Sessions** | Filter by exam, discipline, topic, question state and quantity |
| ✅ **Immediate Feedback** | Instant correction based on the stored answer key |
| 💡 **Explanations** | Manual and AI-assisted explanations for answers and distractors |
| 🖼️ **Visual Context** | Previously processed images support questions where text extraction is insufficient |
| ✍️ **Essay Training** | Timed writing practice, history and AI-assisted evaluation |
| 📊 **Performance Analytics** | Accuracy by topic helps identify areas that require more study |

---

## 🏗️ Architecture

The data pipeline follows a **Medallion-inspired architecture**, separating raw source preservation, extraction, structured data, enrichment and application serving.

```text
┌──────────────────┐
│      Bronze      │  original source PDFs
│  exams / keys /  │  raw, unmodified inputs
│     notices      │
└────────┬─────────┘
         ↓
┌──────────────────┐
│      Silver      │  extracted / intermediate data
└────────┬─────────┘
         ↓
┌──────────────────┐
│       Gold       │  structured questions
└────────┬─────────┘
         ↓
┌──────────────────┐
│     Curated      │  topics + explanations
└────────┬─────────┘
         ↓
┌──────────────────┐
│      SQLite      │  serving + user history
└────────┬─────────┘
         ↓
┌──────────────────┐
│     FastAPI      │  API + application logic
└────────┬─────────┘
         ↓
┌──────────────────┐
│   Web Frontend   │
└──────────────────┘
```

> The **Bronze layer exists in the original data workflow**, but its source PDFs are excluded from this public repository. This keeps the architectural model accurate without redistributing third-party documents.

### Project Structure

```text
concurso-datalake/
├── data/
│   ├── bronze/            # original source PDFs (not distributed publicly)
│   ├── silver/            # intermediate extracted data
│   ├── gold/              # structured questions
│   ├── curated/           # topics and explanations
│   └── concurso.db        # application data and study history
├── scripts/
│   ├── extract_prova.py
│   ├── curate_assuntos.py
│   ├── gen_justificativas.py
│   └── build_db.py
└── app/
    ├── main.py            # FastAPI application
    └── static/            # HTML/CSS/JavaScript frontend
```

---

## 🔄 Data Pipeline

### Bronze — Raw Source Preservation

The **Bronze layer is the raw source layer** of the pipeline.

In this project it is composed of the original documents used as input, including:

- exam PDFs;
- official answer-key PDFs;
- public notices or related source documents when needed by the extraction workflow.

These files are preserved without semantic transformation so the extraction process can always be traced back to the original document.

For the public GitHub version, the Bronze PDFs are **intentionally omitted**. This does not change the pipeline design: Bronze remains the conceptual and operational entry point of the data flow.

### Silver — Extraction & Intermediate Representation

The Silver layer stores intermediate representations produced from the Bronze documents during extraction and normalization. It provides a boundary between raw document interpretation and the structured application model.

Typical responsibilities include:

- extracted text;
- page-level content;
- normalized characters;
- parser checkpoints;
- intermediate question boundaries;
- references to visual crops when text extraction alone is insufficient.

### Gold — Structured Question Data

The Gold layer converts extracted content into structured entities containing fields such as:

- exam;
- discipline;
- topic;
- statement;
- alternatives;
- expected answer;
- page/source reference;
- processing flags.

### Curated — Enrichment

The Curated layer adds information used by the learning experience, including topic classification and explanations.

Manual curation can coexist with automated enrichment, allowing deterministic information to remain independent from generative content.

### Serving Layer

Structured data is consolidated into **SQLite**, which also stores:

- attempts;
- performance history;
- review cycles;
- essays;
- application state.

A **FastAPI** backend exposes these capabilities to the web frontend.

---

## 🧩 Document Processing Engineering

A central challenge is converting heterogeneous exam PDFs from the Bronze layer into reliable structured data.

The parser handles problems such as:

- single-column and multi-column layouts;
- support text associated with groups of questions;
- formatting differences between document providers;
- degraded characters from text extraction or OCR;
- inconsistent question and alternative markers;
- parser resynchronization when expected markers are missing;
- visual fallback for questions containing tables, formulas or code;
- localized validation instead of failing an entire document because of one malformed question.

This makes the extraction pipeline resilient to real-world document inconsistencies rather than assuming perfectly structured input.

---

## 🧠 Spaced Repetition

Incorrectly answered questions enter a progressive review cycle:

```text
Incorrect Answer
       ↓
     1 day
       ↓
     3 days
       ↓
     7 days
       ↓
    15 days
       ↓
   Graduated
```

A successful review advances the question to the next interval. The daily session can therefore combine **due reviews and unseen questions automatically**.

The learning state is persisted in the database rather than being derived only from the current browser session.

---

## 🤖 Applied AI

LLMs are used as an **enrichment and feedback layer**, not as the authoritative source of exam answers.

Current AI-assisted capabilities include:

- explanation generation;
- distractor analysis;
- structured study feedback;
- essay evaluation;
- multimodal context for questions requiring visual information.

A key design decision is the separation between:

```text
Deterministic / Stored Data     Generative Layer
───────────────────────────     ────────────────
Answer key                  →   Explanation
Question structure          →   Feedback
Study history               →   Recommendations
```

This prevents generated text from silently replacing the structured source of truth used by the application.

---

## 📊 Dataset

The application uses a structured dataset generated from previously processed public exam documents.

The **original PDFs belong to the Bronze layer**, but they are not included in this public repository. Silver/Gold/Curated outputs, visual crops required by specific questions and the application database are retained where needed to demonstrate and operate the platform.

This allows the repository to show the complete **Bronze → Silver → Gold → Curated → Serving** architecture without acting as a mirror for the original PDF collections.

---

## ⚙️ Running Locally

### Install dependencies

```bash
pip install pdfplumber fastapi "uvicorn[standard]" anthropic
```

### Start the application

```bash
cd concurso-datalake
python -m uvicorn app.main:app --port 8000
```

Open:

```text
http://127.0.0.1:8000
```

### AI Features

Configure external AI credentials through environment variables.

Windows:

```powershell
set ANTHROPIC_API_KEY=your-key
```

Linux/macOS:

```bash
export ANTHROPIC_API_KEY="your-key"
```

API keys and credentials should never be committed to the repository.

---

## 💡 Incremental AI Enrichment

Explanations can be generated incrementally:

```bash
python scripts/gen_justificativas.py all
python scripts/build_db.py
```

The workflow is designed so enrichment can be interrupted and resumed without requiring the entire dataset to be regenerated from scratch.

---

## 🛠️ Technology Stack

### Backend

**Python · FastAPI · SQLite · REST APIs**

### Data Engineering

**ETL · Medallion Architecture · Bronze / Silver / Gold / Curated · Data Pipelines · Data Normalization · Data Quality · Structured Datasets**

### Applied AI

**LLM Integration · AI-assisted Enrichment · Structured Feedback · Multimodal Context**

### Frontend

**JavaScript · HTML · CSS**

---

## 🎯 Engineering Decisions

Several architectural choices are intentionally visible in this project:

- Treat the original PDFs as an immutable **Bronze source layer**
- Separate raw source-document preservation from extracted application data
- Preserve intermediate representations before producing final structured entities
- Keep manual curation independent from automated enrichment
- Separate deterministic answer data from generative explanations
- Preserve user history when rebuilding the structured question database
- Contain parsing failures instead of invalidating complete processing runs
- Use a lightweight relational database for application serving
- Keep learning state and application rules independent from the frontend
- Make AI an enrichment component rather than the system's source of truth

---

## 🗺️ Roadmap

- [x] Bronze source-document layer
- [x] Document extraction and structuring pipeline
- [x] Silver / Gold / Curated data layers
- [x] FastAPI application
- [x] Web training interface
- [x] Immediate correction
- [x] 1/3/7/15-day spaced repetition
- [x] Performance analytics
- [x] Manual and AI-assisted explanations
- [x] Essay training with AI-assisted evaluation
- [ ] More robust OCR pipeline for scanned documents
- [ ] Controlled generation of novel practice questions
- [ ] Lakehouse pipeline experimentation in Databricks
- [ ] Stateful AI study mentor with graph-based orchestration

---

## 🔒 Data & Intellectual Property

This repository demonstrates the engineering implementation of the platform.

The architecture defines the **Bronze layer as the original exam, answer-key and notice PDFs** used as raw input. Those source files are intentionally **not redistributed** in this public repository. Third-party trademarks and source materials remain the property of their respective owners.

The project is intended for learning, experimentation and demonstration of **software engineering, data engineering and applied AI** techniques.

---

## 👨‍💻 Author

**Jailson Bezerra**

Software Engineering · Automation · Data · AI

- LinkedIn: https://linkedin.com/in/jailsonsb
- Portfolio: https://jailson.es
