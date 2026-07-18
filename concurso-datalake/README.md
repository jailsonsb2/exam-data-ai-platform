# Concurso Data Lake — Treino de Questões

Sistema de treino com questões reais de provas FGV/FCC, focado nos cargos
**ABGF - E05 (FCC)** e **Dataprev - Perfil 4 (FGV)**.

## Arquitetura (medallion)

```
PROVAS CONCURSO/           <- bronze: PDFs originais (provas + gabaritos)
concurso-datalake/
  data/
    silver/                <- texto extraído dos PDFs (ordem de leitura)
    gold/                  <- questões estruturadas em JSON (com gabarito)
    curated/               <- curadoria manual: assunto por questão
    concurso.db            <- SQLite: provas, questoes, tentativas
  scripts/
    extract_prova.py       <- PDF -> silver -> gold (config no dict PROVAS)
    build_db.py            <- gold + curated -> SQLite (idempotente)
  app/
    main.py                <- API FastAPI
    static/                <- frontend vanilla JS/HTML/CSS
```

## Como usar

```powershell
cd concurso-datalake
python -m uvicorn app.main:app --port 8000
# abrir http://127.0.0.1:8000
```

Dependências: `pip install pdfplumber fastapi "uvicorn[standard]"`

## Fluxo de treino

1. **Sessão do dia** (recomendado): um clique monta a sessão diária —
   primeiro as questões devidas na repetição espaçada (você errou → volta em
   1 dia; acertou a revisão → 3, 7, 15 dias; depois "gradua"), completando
   com questões novas (respeitando os filtros escolhidos, se houver).
2. **Sessão manual**: escolha prova/disciplina/assunto e o modo
   (todas, só não respondidas, ou só as que errou na última tentativa).
3. Responda; o app mostra na hora se acertou, a justificativa (quando
   existe) e registra a tentativa. Questões de revisão aparecem com 🔁.
4. **Redação**: aba com 10 temas dissertativo-argumentativos estilo FCC,
   cronômetro de 60 min, contador de palavras/linhas e histórico. Com
   `ANTHROPIC_API_KEY` configurada no ambiente do servidor, o botão
   "Corrigir com IA" avalia no padrão FCC (nota 0-10 + erros apontados).
5. **Desempenho**: taxa de acerto por assunto, ordenada do pior para o
   melhor — use para decidir qual teoria estudar.

Questões com fórmula/código/tabela em imagem exibem um **recorte em PNG da
região da questão no PDF original** (gerado automaticamente pelo extrator em
`app/static/img/<chave>/`), então nada se perde. Questões anuladas ficam fora
do treino.

## Justificativas

Ao responder, o app mostra a justificativa da questão (por que o gabarito está
certo e qual a pegadinha das distratoras), quando disponível. As justificativas
ficam em `data/curated/<chave>.justificativas.json`:

- O bloco de Ciência de Dados/ML e Matemática da Dataprev 2024 tem
  justificativas escritas e revisadas manualmente.
- Para gerar as demais em lote via Claude API:
  `set ANTHROPIC_API_KEY=...` e
  `python scripts/gen_justificativas.py all` (incremental — pode interromper e
  retomar; questões com código/fórmula são enviadas com o recorte PNG da prova).
  Depois `python scripts/build_db.py`.

## Para adicionar uma nova prova

1. Adicionar entrada no dict `PROVAS` em `scripts/extract_prova.py`
   (arquivo PDF, gabarito oficial, faixas de disciplina, padrões de ruído).
2. `python scripts/extract_prova.py <chave-da-prova>`
3. Conferir o JSON em `data/gold/` (flag `revisar` indica questões com
   conteúdo em imagem) e rodar `python scripts/curate_assuntos.py`
   (tags automáticas por palavra-chave; a curadoria manual prevalece).
4. Opcional: `python scripts/gen_justificativas.py <chave>`.
5. `python scripts/build_db.py` (preserva o histórico de tentativas).

## Provas no banco

| Prova | Questões | Bloco de dados |
|---|---|---|
| FGV 2024 Dataprev - ATI Inteligência da Informação | 70 (3 anuladas) | q41-70 |
| FGV 2024 CVM - Analista Perfil 7 Ciência de Dados | 70 (2 anuladas) | q1-70 |
| FGV 2024 EPE - Analista TI Ciência de Dados | 80 (2 anuladas) | q36-80 |
| FGV 2024 TJ-RR - Analista Ciência de Dados e Analytics | 70 | q31-70 |
| FGV 2025 TCE-PI - Auditor TI/Eng. de Dados/Ciência de Dados | 100 (2 anuladas) | q66-100 |
| FGV 2026 ALEGO - Analista de Ciência de Dados | 70 | q41-70 |
| FCC 2023 TRT-15 - Analista Judiciário TI (Tipo 2) | 60 | q21-60 |
| FCC 2023 TRT-18 - Analista Judiciário Área Judiciária | 60 | (Direito) |
| FCC 2025 Prefeitura de SP - Analista TIC | 90 | q21-90 |

As provas FCC usam `estilo: "fcc"` no extrator (coluna única, numeração
"N." inline, blocos "Atenção: ... questões X a Y" como texto de apoio) com
tolerância a OCR: confusões de dígitos/letras, ressincronização quando o
marcador da questão se perde, e recorte PNG (ou página inteira) para toda
questão com defeito de OCR — nada fica intreinável.

## Provas FCC pendentes (não extraídas)

| Prova | Motivo |
|---|---|
| MPE-PB 2024 Administrador de BD | O PDF de gabarito no repositório é do cargo errado (B02-Desenvolvedor; a prova é A01-Administrador de BD). Baixar o gabarito certo e configurar. |
| TRT-12 2023 TI | Camada de texto com OCR muito degradado. Requer OCR novo (ex.: Tesseract). |
| TRT-21 2023 TI | PDF escaneado sem camada de texto. Requer OCR. |
| TRF-4 2025 Análise de Sistemas | PDF escaneado sem camada de texto. Requer OCR. |
| SEFAZ-SP 2026 AFRE TIC | PDF escaneado sem camada de texto. Requer OCR. |
