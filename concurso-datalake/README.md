# 🎯 Concurso Data Lake

> Sistema pessoal de treino com **questões reais de concurso** (FGV, FCC e
> Cebraspe), repetição espaçada, justificativas por IA e treino de redação —
> focado nos cargos **Dataprev — Perfil 4 / Inteligência da Informação (FGV)** e
> **ABGF — E05 (FCC)**.

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-data-003B57?logo=sqlite&logoColor=white)
![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-frontend-F7DF1E?logo=javascript&logoColor=black)

**790 questões** extraídas de 10 provas reais (2022–2026), com gabarito
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

Há duas formas de usar: o app completo no PC (FastAPI + SQLite) e o **site
estático**, publicado na Netlify para estudar pelo celular, inclusive
offline.

### No PC (FastAPI)

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

### No celular (site estático na Netlify)

```powershell
cd concurso-datalake
python scripts/build_site.py    # gera a pasta site/
node scripts/test_site.js       # 30 testes da lógica e dos dados
```

Depois é só commitar e publicar: a Netlify serve `concurso-datalake/site`
sem etapa de build (a configuração está em [`netlify.toml`](../netlify.toml)).

---

## 📱 O site estático

Netlify não roda Python nem guarda arquivo entre requisições, então a versão
do celular não tem backend: `build_site.py` exporta o banco para
`site/dados/questoes.json` (~770 KB) e **toda a lógica roda no navegador** —
a mesma repetição espaçada, os mesmos filtros e as mesmas estatísticas.

| | |
|---|---|
| 📴 **Offline** | Um service worker guarda o app e as questões no aparelho: funciona em túnel, metrô e ônibus sem sinal. Os recortes de PDF entram no cache conforme você esbarra neles |
| 👤 **Perfis** | Mais de uma pessoa usando o mesmo aparelho: cada perfil tem seu histórico, sua repetição espaçada, suas redações e sua chave do Gemini |
| 💾 **Progresso local** | Respostas, revisões e redações ficam no `localStorage` **deste aparelho** — não sincroniza com o PC |
| 📤 **Backup** | Aba **Ajustes** exporta e importa o progresso em JSON (a importação mescla, então dá para juntar aparelhos) |
| 🌙 **Modo escuro** | Automático, seguindo o tema do celular |
| ✍️ **Redação por IA** | Opcional: você cola sua chave do Gemini em Ajustes e ela fica **só no celular**, chamando o Google direto do navegador |
| 📵 **Fora dos buscadores** | `robots.txt` + `X-Robots-Tag: noindex` — é conteúdo de prova das bancas |

O histórico que você já fez no PC viaja junto no primeiro acesso: o export
leva as tentativas do SQLite e o site as semeia uma única vez — **no primeiro
perfil apenas**, para que um perfil novo não comece com as respostas de outra
pessoa.

### 👤 Perfis

O site tem **uma senha só** (Basic Auth na edge function da Netlify): quem a
tem, entra. Os perfis não são autenticação — são a separação do progresso de
cada pessoa **dentro de um mesmo aparelho**. O nome de quem está estudando
fica sempre visível no cabeçalho; tocar nele abre a tela de trocar/criar.

| | |
|---|---|
| Onde ficam | `tc.<id>.tentativas`, `tc.<id>.redacoes`, `tc.<id>.geminiKey` no `localStorage` |
| Quem cria | Qualquer pessoa que passe da senha do site cria o próprio perfil |
| Migração | Quem já usava o site antes dos perfis tem o histórico movido para o perfil "Meu progresso" na primeira abertura — nada se perde |
| Backup | Exporta e importa **o perfil aberto**; o arquivo carrega o nome do perfil e a importação avisa se você estiver misturando históricos de pessoas diferentes |

⚠️ Perfis **não** sincronizam entre aparelhos: quem estudar no celular e no PC
terá dois históricos (use o backup em JSON para juntar). Também não protegem
um do outro — qualquer pessoa com o aparelho pode trocar de perfil, como no
seletor de perfis da Netflix.

O app FastAPI do PC (`app/main.py`) continua de usuário único: lá o histórico
é o próprio SQLite.

> ⚠️ A senha do site é única e compartilhada, e roda na borda
> (`netlify/edge-functions/auth.ts`, variáveis `SITE_USER`/`SITE_PASS`), antes
> de qualquer arquivo — inclusive `dados/questoes.json` e os recortes de PDF.
> Quem recebe a senha tem o banco de provas inteiro: divulgue com critério.

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

⚠️ Questões não cobrem o edital sozinhas: o que nunca caiu nessas 10 provas
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
    │   ├── gen_justificativas_gemini.py  ← idem, na cota gratuita do Gemini
    │   ├── build_db.py            ← gold + curated → SQLite (preserva o histórico)
    │   ├── build_site.py          ← SQLite + web/ → site/ (build estático)
    │   └── test_site.js           ← testes do site estático (node)
    ├── app/
    │   ├── main.py            ← API FastAPI (versão do PC)
    │   └── static/            ← frontend vanilla JS/HTML/CSS
    ├── web/                   ← fontes do site estático (celular)
    └── site/                  ← gerado: é o que a Netlify publica
```

O extrator tem três estilos de parse:

- **`fgv`** — duas colunas, número da questão em linha própria, textos de
  apoio "Use the following TEXT..." atribuídos às próximas N questões.
- **`fcc`** — coluna única, número "N." inline, blocos "Atenção: ...
  questões X a Y" como texto de apoio por faixa, e **tolerância a OCR**:
  mapas de confusão de dígitos/letras ("?." = 7, "(6)" = (C)), número sem
  ponto, e ressincronização quando o marcador da questão se perde — questões
  com defeito residual ganham flag `revisar` + recorte PNG, nada fica
  intreinável.
- **`cespe`** — itens certo/errado, número inline ("51 A Constituição..."),
  sem alternativas impressas no caderno. O comando do bloco ("Acerca de X,
  julgue os itens a seguir") e os textos de apoio não têm marcador nenhum:
  são detectados por **espaçamento vertical** — o item só termina em fim de
  frase, e daí um espaço maior (ou a virada de coluna) indica outro bloco,
  que vira o `texto_apoio` corrente até ser substituído. O primeiro item de
  cada bloco leva junto o recorte do apoio, para que planilhas e imagens sem
  camada de texto (Excel, Outlook) apareçam na tela. `colunas_por_pagina`
  cobre as páginas que trocam de diagramação no meio do caderno.

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
| CEBRASPE 2022 · INSS · Técnico do Seguro Social (caderno 787, 11/12) | 120 (2 anuladas) | (certo/errado) |

**Total: 790 questões (779 respondíveis; 778 no site do celular).**

⚠️ O INSS 2022 aplicou a prova **duas vezes**, com cadernos e gabaritos
diferentes: **760** (27/11/2022) e **787** (11/12/2022). O código fica no
cabeçalho de cada página (`787CB1_01N500940`) e precisa bater com o número do
arquivo de gabarito — parear errado não quebra nada, só troca a resposta de
dezenas de itens em silêncio. Por isso o config declara `caderno` e o extrator
confere (`conferir_caderno`).

A prova do INSS é **certo/errado**, não múltipla escolha: cada item vale um
julgamento e o app desenha só os botões **(C) Certo** e **(E) Errado**. O
formato fica gravado em `provas.formato` (`ce` ou `abcde`), então provas das
duas bancas convivem no mesmo banco e na mesma sessão de treino.

A ALEGO q61 ("selecione a visualização do tipo Boxplot") fica de fora do site
estático: as cinco alternativas são gráficos que a extração não capturou, e
sem elas a questão só pode ser respondida no chute. As outras 22 questões cujo
texto das alternativas se perdeu têm o recorte da prova, então o app mostra as
cinco letras para você escolher lendo a imagem.

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

**Cobertura atual: 778/778 questões do site (100%)** — as dez provas têm
justificativa em todas as questões respondíveis.

O bloco de Ciência de Dados/ML e Matemática da Dataprev (q41–70) tem
justificativas **escritas e revisadas manualmente**; o restante foi gerado em
lote com `gemini-3.1-flash-lite`. Para regerar ou completar uma prova nova,
via Claude:

```powershell
set ANTHROPIC_API_KEY=sua-chave
python scripts/gen_justificativas.py all     # incremental: pode interromper e retomar
python scripts/build_db.py
```

Ou pela **cota gratuita do Gemini** (`gemini-3.1-flash-lite`: 15 req/min e
500 req/dia, então o lote completo leva dois dias):

```powershell
set GEMINI_API_KEY=sua-chave
python scripts/gen_justificativas_gemini.py all --max 460   # hoje
python scripts/gen_justificativas_gemini.py all             # amanhã
python scripts/build_db.py
python scripts/build_site.py
```

Os dois scripts pulam o que já existe e gravam a cada questão — dá para
interromper com Ctrl+C e retomar. Ao bater a cota diária, o script avisa e
para sozinho.

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
7. `python scripts/build_site.py` + `node scripts/test_site.js` — atualiza o
   site do celular; commite `site/` para a Netlify publicar.

---

## 🗺️ Roadmap

- [x] Extração FGV (6 provas), FCC (3 provas) e Cebraspe certo/errado (1 prova)
      com validação de gabarito e conferência do caderno
- [x] App de treino com filtros, correção imediata e recortes de PDF
- [x] Justificativas (manuais + geração em lote via Claude API)
- [x] Sessão do dia com repetição espaçada (1/3/7/15 dias)
- [x] Treino de redação discursiva FCC com correção por IA
- [x] Site estático offline (PWA) para estudar pelo celular, publicado na Netlify
- [ ] OCR (Tesseract) para as provas escaneadas pendentes
- [ ] Geração de questões inéditas ancoradas nas reais (mentor "engenharia reversa")
- [ ] Case Databricks: replicar o pipeline medallion (bronze/silver/gold) no Free Edition
- [ ] Mentor de estudos com LangGraph (agente com estado sobre o banco de questões)

---

## ⚖️ Aviso

Provas e gabaritos são de titularidade das respectivas bancas (FGV, FCC) e
órgãos. Este projeto é **pessoal e privado**, para fins exclusivos de
estudo. Não redistribua o conteúdo das provas.
