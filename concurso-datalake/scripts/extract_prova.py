# -*- coding: utf-8 -*-
"""Extrai questões de provas FGV/FCC (layout 2 colunas) para JSON estruturado.

Além do texto, renderiza um PNG da região da questão no PDF para as questões
com fórmula/código/tabela em imagem (flag `revisar`).

Uso: python extract_prova.py <chave-da-prova>
As provas são configuradas no dict PROVAS abaixo.
"""
import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent      # concurso-datalake/
PDF_DIR = ROOT.parent                              # pasta com os PDFs
SILVER = ROOT / "data" / "silver"
GOLD = ROOT / "data" / "gold"
IMG_DIR = ROOT / "app" / "static" / "img"

PROVAS = {
    "fgv-2024-dataprev-inteligencia": {
        "pdf": "fgv-2024-dataprev-ati-inteligencia-da-informacao-prova.pdf",
        "banca": "FGV",
        "ano": 2024,
        "orgao": "Dataprev",
        "cargo": "Analista de TI - Inteligência da Informação",
        "tipo": "TIPO 1",
        "n_questoes": 70,
        # Gabarito definitivo TIPO 1 ('*' = anulada)
        "gabarito": (
            "E D C C A D C D A D E A * B E C D E D A "
            "B E B C C B B D C A B A D C E D A B E C "
            "A C B B * C D C A D B D E D E D E A A E "
            "B B * B E B B E D A"
        ).split(),
        "crop_top": 55,
        "crop_bottom": 35,
        # faixas de disciplina (inclusive) — os cabeçalhos de seção do PDF
        # vazam no meio do texto, então o mapeamento por faixa é mais confiável
        "disciplinas": [
            (1, 12, "Língua Portuguesa"),
            (13, 24, "Língua Inglesa"),
            (25, 30, "Raciocínio Lógico-Matemático"),
            (31, 35, "Atualidades"),
            (36, 40, "Legislação de Segurança da Informação e Proteção de Dados"),
            (41, 52, "Matemática e Estatística"),
            (53, 70, "Ciência de Dados e Machine Learning"),
        ],
        # ruídos de cabeçalho/rodapé e cabeçalhos de seção que vazam no texto
        "noise": [
            r"ATI\s*-\s*Intelig[êe]ncia da Informa[çc][ãa]o\s*[–-]\s*TARDE",
            r"TIPO BRANCA\s*[–-]\s*P[ÁA]GINA \d+",
            r"EMPRESA DE TECNOLOGIA E INFORMA[ÇC][ÕO]ES DA PREVID[ÊE]NCIA.*",
            r"FGV CONHECIMENTO",
            r"Conhecimentos Gerais",
            r"Conhecimentos Espec[íi]ficos",
            r"L[íi]ngua Portuguesa",
            r"L[íi]ngua Inglesa",
            r"Racioc[íi]nio L[óo]gico[\s-]*Matem[áa]tico",
            r"Atualidades",
            r"Legisla[çc][ãa]o Acerca de Seguran[çc]a da\s+Informa[çc][ãa]o e Prote[çc][ãa]o de Dados",
        ],
    },
    "fgv-2024-cvm-ciencia-de-dados": {
        "pdf": "fgv-2024-cvm-analista-cvm-perfil-7-ciencia-de-dados-tarde-prova.pdf",
        "banca": "FGV",
        "ano": 2024,
        "orgao": "CVM",
        "cargo": "Analista - Perfil 7 - Ciência de Dados",
        "tipo": "TIPO 1",
        "n_questoes": 70,
        "gabarito": (
            "C D B A A A D E C A A E D C A D E B D E "
            "A C B C B A B D C A D C C E E E A A B D "
            "B D C C A D D D A C E B D D D C * D E E "
            "C * B B D D B B C C"
        ).split(),
        "crop_top": 55,
        "crop_bottom": 35,
        "disciplinas": [
            (1, 45, "Ciência de Dados"),
            (46, 70, "Matemática e Estatística"),
        ],
        "noise": [
            r"COMISS[ÃA]O DE VALORES MOBILI[ÁA]RIOS",
            r"FGV CONHECIMENTO",
            r"TIPO\s*1\s*[–-]\s*BRANCA.*",
            r"Analista CVM.*Ci[êe]ncia de Dados.*",
            r"CONHECIMENTOS ESPEC[ÍI]FICOS",
            r"^Matem[áa]tica e Estat[íi]stica$",
        ],
    },
    "fgv-2024-epe-ciencia-de-dados": {
        "pdf": "fgv-2024-epe-analista-de-gestao-corporativa-tecnologia-da-informacao-ciencia-de-dados-prova.pdf",
        "banca": "FGV",
        "ano": 2024,
        "orgao": "EPE",
        "cargo": "Analista de Gestão Corporativa - TI - Ciência de Dados",
        "tipo": "TIPO 1",
        "n_questoes": 80,
        "gabarito": (
            "C A * D A D B E * D C D A E E B C A E B "
            "B A E B D C E A E D C A B E E A D E D D "
            "A C E E B D A B C D E E D C B B C B E D "
            "D A A B B D A C B A E B D E A B D D C A"
        ).split(),
        "crop_top": 55,
        "crop_bottom": 35,
        "disciplinas": [
            (1, 10, "Língua Portuguesa"),
            (11, 20, "Língua Inglesa"),
            (21, 35, "Noções de Administração Pública"),
            (36, 80, "Ciência de Dados"),
        ],
        "noise": [
            r"EMPRESA DE PESQUISAS? ENERG[ÉE]TICAS?( - EPE)?",
            r"FGV CONHECIMENTO",
            r"TIPO\s*1\s*[–-]\s*BRANCA.*",
            r"[A-ZÊÇÃ]*IA DE DADOS\s*[–-]\s*TARDE",
            r"TIPO BRANCA\s*[–-]\s*P[ÁA]GINA \d+",
            r"Conhecimentos B[áa]sicos",
            r"Conhecimentos Espec[íi]ficos",
            r"L[íi]ngua Portuguesa",
            r"L[íi]ngua Inglesa",
            r"^No[çc][õo]es de Administra[çc][ãa]o P[úu]blica$",
        ],
        # erro de diagramação do caderno: código interno no lugar do nº 64
        "marcadores_extra": {"NSCE007-00_29": 64},
    },
    "fgv-2024-tjrr-ciencia-de-dados": {
        "pdf": "fgv-2024-tj-rr-analista-judiciario-ciencia-de-dados-e-analytics-prova.pdf",
        "banca": "FGV",
        "ano": 2024,
        "orgao": "TJ-RR",
        "cargo": "Analista Judiciário - Ciência de Dados e Analytics",
        "tipo": "TIPO 1",
        "n_questoes": 70,
        "gabarito": (
            "C D C D C B B C E E D B A C D B A A C D "
            "E E A D E D B E A E A E C D E C B D E A "
            "E C B D B B E A D C D C C A D B A B B A "
            "E A B D A A B B C D"
        ).split(),
        "crop_top": 55,
        "crop_bottom": 35,
        "disciplinas": [
            (1, 16, "Língua Portuguesa"),
            (17, 30, "Legislação"),
            (31, 70, "Ciência de Dados e Analytics"),
        ],
        "noise": [
            r"TRIBUNAL DE JUSTI[ÇC]A DO ESTADO DE RORAIMA",
            r"FGV CONHECIMENTO",
            r"TIPO\s*1\s*[–-]?\s*BRANCA.*",
            r"ANALISTA JUDICI[ÁA]RIO\s*[–-]\s*CI[ÊE]NCIA DE DADOS E ANALYTICS\s*\(MANH[ÃA]\)",
            r"TIPO BRANCA\s*[–-]\s*P[ÁA]GINA \d+",
            r"L[ÍI]NGUA PORTUGUESA",
            r"^LEGISLA[ÇC][ÃA]O$",
            r"CONHECIMENTOS ESPEC[ÍI]FICOS",
        ],
    },
    "fgv-2025-tcepi-dados": {
        "pdf": ("fgv-2025-tce-pi-auditor-de-controle-externo-controle-externo-"
                "especifica-de-tecnologia-da-informacao-sistemas-engenharia-de-"
                "dados-e-ciencia-de-dados-manha-prova.pdf"),
        "banca": "FGV",
        "ano": 2025,
        "orgao": "TCE-PI",
        "cargo": "Auditor de Controle Externo - TI - Sistemas, Eng. de Dados e Ciência de Dados",
        "tipo": "TIPO 1",
        "n_questoes": 100,
        "gabarito": (
            "* C B C D D D E E D D A B E E B C D D A "
            "C B D E E A B B E B E A C B E B E E B B "
            "A C D A A B E D C C D C A E B D E E B B "
            "A D B C B E D E B E C D B A D B C B C B "
            "D D B E * B C C C B B A E D B E B D B B"
        ).split(),
        "crop_top": 55,
        "crop_bottom": 35,
        "disciplinas": [
            (1, 10, "Língua Portuguesa"),
            (11, 20, "Língua Inglesa"),
            (21, 30, "Legislação Aplicável ao TCE-PI"),
            (31, 38, "Administração Financeira e Orçamentária"),
            (39, 44, "Auditoria Governamental"),
            (45, 50, "Controle Externo da Administração Pública"),
            (51, 55, "Noções de Direito Administrativo"),
            (56, 65, "Noções de Direito Constitucional"),
            (66, 100, "TI - Sistemas, Engenharia de Dados e Ciência de Dados"),
        ],
        "noise": [
            r"TRIBUNAL DE CONTAS DO ESTADO DO PIAU[ÍI]",
            r"FGV CONHECIMENTO",
            r"TIPO\s*1\s*[–-]?\s*BRANCA.*",
            r"S E CI[ÊE]NCIA DE DADOS\s*[–-]\s*MANH[ÃA]",
            r"TIPO BRANCA\s*[–-]\s*P[ÁA]GINA \d+",
            r"CONHECIMENTOS B[ÁA]SICOS",
            r"CONHECIMENTOS ESPEC[ÍI]FICOS",
            r"CONHECIMENTOS ESPECIALIZADOS",
            r"L[íi]ngua Portuguesa",
            r"L[íi]ngua Inglesa",
            r"Legisla[çc][ãa]o Aplic[áa]vel ao Tribunal de",
            r"^Contas do Estado do Piau[íi]$",
            r"^Administra[çc][ãa]o Financeira e$",
            r"^Or[çc]ament[áa]ria$",
            r"^Auditoria Governamental$",
            r"^Controle Externo da Administra[çc][ãa]o$",
            r"^P[úu]blica$",
            r"^No[çc][õo]es de Direito Administrativo$",
            r"^No[çc][õo]es de Direito Constitucional$",
        ],
    },
    "fgv-2026-alego-ciencia-de-dados": {
        "pdf": "fgv-2026-al-go-analista-legislativo-analista-de-ciencia-de-dados-prova.pdf",
        "banca": "FGV",
        "ano": 2026,
        "orgao": "ALEGO",
        "cargo": "Analista Legislativo - Analista de Ciência de Dados",
        "tipo": "TIPO 1",
        "n_questoes": 70,
        "gabarito": (
            "C E C E A B A B A E D A A C B A E C B D "
            "D B D E E C E C C E A B E D E A C B E B "
            "C A E A E C E C B B E C E C A E C E A C "
            "B C A E B E B C E C"
        ).split(),
        "crop_top": 55,
        "crop_bottom": 35,
        "disciplinas": [
            (1, 14, "Língua Portuguesa"),
            (15, 24, "Raciocínio Lógico"),
            (25, 28, "Legislação do Estado de Goiás"),
            (29, 34, "Direito Constitucional"),
            (35, 40, "Direito Administrativo"),
            (41, 70, "Ciência de Dados"),
        ],
        "noise": [
            r"ASSEMBLEIA LEGISLATIVA DO ESTADO DE GOI[ÁA]S( - ALEGO)?",
            r"FGV CONHECIMENTO",
            r"TIPO\s*1\s*[–-]?\s*BRANCA.*",
            r"Analista Legislativo - Analista de Ci[êe]ncia de Dados\s*[–-]\s*TARDE",
            r"TIPO BRANCA\s*[–-]\s*P[ÁA]GINA \d+",
            r"Conhecimentos B[áa]sicos",
            r"Conhecimentos Espec[íi]ficos",
            r"L[íi]ngua Portuguesa",
            r"Racioc[íi]nio L[óo]gico",
            r"Legisla[çc][ãa]o do Estado de Goi[áa]s",
            r"^Direito Constitucional$",
            r"^Direito Administrativo$",
            r"^Analista de Ci[êe]ncia de Dados$",
        ],
    },
    "fcc-2023-trt15-ti": {
        "pdf": ("fcc-2023-trt-15-regiao-sp-analista-judiciario-area-apoio-"
                "especializado-especialidade-tecnologia-da-informacao-prova.pdf"),
        "banca": "FCC",
        "ano": 2023,
        "orgao": "TRT-15 (Campinas/SP)",
        "cargo": "Analista Judiciário - Tecnologia da Informação",
        "tipo": "Tipo 2",
        "estilo": "fcc",
        "colunas": 1,
        "n_questoes": 60,
        "gabarito": (
            "C D A C B A D E E B A D B C E A D C E B "
            "C B E E B C A C D D E D B A D B E B A A "
            "C D A D B E A D B E C A D E C A C B E C"
        ).split(),
        "crop_top": 40,
        "crop_bottom": 40,
        "disciplinas": [
            (1, 10, "Língua Portuguesa"),
            (11, 20, "Raciocínio Lógico-Matemático"),
            (21, 60, "Tecnologia da Informação"),
        ],
        "noise": [
            r"Caderno de Prova .{1,12}, Tipo \d+",
            r"TRT15-.*",
            r"^\d{1,2}$",
        ],
    },
    "fcc-2023-trt18-judiciaria": {
        "pdf": "fcc-2023-trt-18-regiao-go-analista-judiciario-area-judiciaria-prova.pdf",
        "banca": "FCC",
        "ano": 2023,
        "orgao": "TRT-18 (GO)",
        "cargo": "Analista Judiciário - Área Judiciária",
        "tipo": "Tipo 1",
        "estilo": "fcc",
        "colunas": 1,
        "n_questoes": 60,
        "gabarito": (
            "B A C E D B D B A C E D A C E D A B A C "
            "E A D B C A D B E C C A D A E B C B D E "
            "E D B E D A A C B C B C A E D D B E C A"
        ).split(),
        "crop_top": 40,
        "crop_bottom": 40,
        "disciplinas": [
            (1, 17, "Língua Portuguesa"),
            (18, 25, "Matemática e Raciocínio Lógico"),
            (26, 60, "Direito e Legislação"),
        ],
        "noise": [
            r"Caderno de Prova .{1,12}, Tipo \d+",
            r"TRT18-.*",
            r"^\d{1,2}$",
        ],
    },
    "fcc-2025-prefsp-tic": {
        "pdf": ("fcc-2025-prefeitura-de-sao-paulo-sp-analista-de-planejamento-e-"
                "desenvolvimento-organizacional-tecnologia-da-informacao-e-"
                "comunicacao-prova.pdf"),
        "banca": "FCC",
        "ano": 2025,
        "orgao": "Prefeitura de São Paulo",
        "cargo": "Analista de Planej. e Desenv. Organizacional - TIC",
        "tipo": "Tipo 1",
        "estilo": "fcc",
        "colunas": 1,
        "n_questoes": 90,
        "gabarito": (
            "D A E C B E A D B C D B C A E D A C E B "
            "C B E B C B D E A B B D C E A B E C A D "
            "C A D D B C B E C A E E D E D B B D E B "
            "A C C A D A A B B E D B C D E C D A C C "
            "E D B A C A B B D E"
        ).split(),
        "crop_top": 40,
        "crop_bottom": 40,
        "disciplinas": [
            (1, 10, "Língua Portuguesa"),
            (11, 15, "Raciocínio Lógico-Matemático"),
            (16, 20, "Estatística"),
            (21, 90, "Tecnologia da Informação e Comunicação"),
        ],
        "noise": [
            r"Caderno de Prova .{1,12}, Tipo \d+",
            r"PMSP.*",
            r"^\d{1,2}$",
        ],
    },
    "cebraspe-2022-inss-tecnico-seguro-social": {
        "pdf": "cebraspe-2022-inss-tecnico-do-seguro-social-prova.pdf",
        "banca": "CEBRASPE",
        "ano": 2022,
        "orgao": "INSS",
        "cargo": "Técnico do Seguro Social",
        "tipo": "Aplicação 11/12/2022",
        "estilo": "cespe",
        "formato": "ce",
        # código do caderno impresso no cabeçalho: amarra a prova ao gabarito
        "caderno": "787",
        "colunas": 2,
        # a página do raciocínio lógico (itens 46-50) é impressa em uma coluna só
        "colunas_por_pagina": {4: 1},
        # itens cuja planilha/imagem só existe como figura no PDF
        "revisar_extra": (44, 45),
        "n_questoes": 120,
        # Gabaritos oficiais DEFINITIVOS ('X' = item anulado):
        #   itens 1-50   → 787_INSS_CB1_01 (conhecimentos básicos)
        #   itens 51-120 → 787_INSS_001_01 (conhecimentos específicos)
        #
        # ATENÇÃO: o INSS 2022 teve DUAS aplicações, com cadernos e gabaritos
        # diferentes — 760 (27/11/2022) e 787 (11/12/2022). O código do caderno
        # aparece no cabeçalho de cada página da prova ("787CB1_01N500940"), e
        # é ele que precisa bater com o número do arquivo de gabarito. Parear
        # errado passa despercebido: a extração valida, o app funciona, e só o
        # gabarito fica trocado em ~40% dos itens.
        "gabarito": (
            "E C C E E E C C E C E C E E C C E C E E "
            "C C C E C E E C C E E E C E C E E C E C "
            "C X E E E C E E C E "
            "C E E C C C C E C E E E C C E E E C X C "
            "E E E C C E E C C C E E E C C C E E C C "
            "C E E C C E E E C C E E C C E E C E C C "
            "C C E E E C C C E C"
        ).split(),
        "crop_top": 42,
        "crop_bottom": 28,
        "disciplinas": [
            (1, 14, "Língua Portuguesa"),
            (15, 20, "Ética no Serviço Público"),
            (21, 30, "Noções de Direito Constitucional"),
            (31, 40, "Noções de Direito Administrativo"),
            (41, 45, "Noções de Informática"),
            (46, 50, "Raciocínio Lógico"),
            (51, 120, "Direito Previdenciário e Seguridade Social"),
        ],
        # os banners centralizados da capa ficam partidos ao meio pelo recorte
        # de colunas ("-- CADERNO DE PRO" | "OVAS OBJETIVAS --"), então os
        # padrões precisam casar com os dois pedaços
        "noise": [
            r"\d{3}(?:CB\d|\d{3})_\d+[A-Z]\d+\s+CEBRASPE.*",
            r"--\s*CADERNO DE PRO\w*",
            r"O?VAS OBJETIVAS\s*--",
            r"--\s*CONHECIMENTO?S?\b",
            r"^\w{0,3}OS (?:B[ÁA]SICOS|ESPEC[ÍI]FICOS)\s*--",
            r"^Espa[çc]o livre$",
        ],
    },
}

# fecho tolerante a OCR: "(D)", "(Dj", "(Bj)", "(D]"
ALT_RE = re.compile(r"^\(([A-E])[\)\]jJ]\)?\s?(.*)$")
APOIO_RE = re.compile(
    r"Use the following TEXT to answer the next (\w+) questions?\.?", re.I)
# estilo FCC: número da questão inline ("5. Enunciado começa aqui...";
# tolera espaços do OCR antes do ponto e entre os dígitos ("1 0 .")
FCC_NUM_RE = re.compile(r"^(\d(?:\s?\d){0,2})\s{0,2}\.\s+(\S.*)$")
# confusões comuns de OCR por dígito (ex.: "?." = 7., "B." = 8., "t0." = 10.)
OCR_DIGITOS = {"0": "0OoDQ°", "1": "1lIitT", "2": "2Zz", "3": "3E",
               "4": "4A", "5": "5S", "6": "6Gb", "7": "7?T", "8": "8B",
               "9": "9gq"}
# token de 1-3 caracteres, tolerando espaço entre eles ("1 0 .")
FCC_NUM_OCR_RE = re.compile(r"^([^\s.](?:\s?[^\s.]){0,2})\s{0,2}\.\s+(\S.*)$")
# confusões de OCR para as LETRAS das alternativas ("(6)"=C, "(4)"=A, "(Cc)")
OCR_LETRAS = {"A": "4Aa@", "B": "8Bb", "C": "6Cc€G", "D": "0DOo", "E": "3Ee£"}


def token_ocr_igual(token: str, num: int) -> bool:
    """True se `token` for uma corrupção plausível de OCR do número `num`."""
    s = str(num)
    token = token.replace(" ", "")
    if len(token) != len(s):
        return False
    return all(ch in OCR_DIGITOS[d] for ch, d in zip(token, s))
# estilo CEBRASPE: item "certo/errado" com o número inline ("51 A Constituição...")
CESPE_NUM_RE = re.compile(r"^(\d{1,3})\s+(\S.*)$")
# fim de sentença: separa o texto de um item do bloco de comando que vem depois
TERM_RE = re.compile(r"[.!?][\"'”’)\]]?$")
CESPE_ALTS = {"C": "Certo", "E": "Errado"}
# estilo FCC: texto de apoio com faixa explícita de questões
FCC_ATENCAO_RE = re.compile(
    r"^Aten[çc][ãa]o:.*quest(?:[ãa]o|[õo]es)\s+de\s+n[úu]meros?\s+"
    r"(\d+)(?:\s*(?:a|e)\s*(\d+))?", re.I)
NUM_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
             "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
# caracteres de fórmulas que o pdfplumber não extrai direito
# (inclui a área de uso privado U+E000-U+F8FF usada pelas fontes de fórmula)
MATH_RE = re.compile(r"[𝐀-𝟿-∫∑√ℝℕπ⋅]|lim")
# referências a conteúdo que fica em imagem no PDF (código, tabela, figura)
FIG_RE = re.compile(
    r"(figura|imagem|gr[áa]fico|diagrama|tabela|c[óo]digo|script|quadro)"
    r"[^.]{0,40}(a seguir|abaixo|apresentad)"
    r"|seguinte\s+(c[óo]digo|script|conjunto|distribui[çc][ãa]o|tabela|quadro|figura)"
    r"|conjunto de transa[çc][õo]es"
    r"|observe o exemplo", re.I)

RENDER_DPI = 160


def extract_lines(pdf_path, crop_top, crop_bottom, colunas=2, por_pagina=None):
    """Extrai linhas na ordem de leitura (coluna esquerda, depois direita).

    `colunas=1` para provas de coluna única (FCC); 2 para FGV. `por_pagina`
    ({número da página: colunas}) cobre os cadernos que trocam de diagramação
    no meio da prova.
    Retorna lista de (meta, texto), onde meta identifica página, coluna e a
    posição vertical da linha — usado depois para renderizar a região da
    questão como imagem.
    """
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            w, h = page.width, page.height
            n_col = (por_pagina or {}).get(i, colunas)
            if n_col == 1:
                faixas = ((0, w),)
            else:
                faixas = ((0, w / 2), (w / 2, w))
            for ci, (x0, x1) in enumerate(faixas):
                col = page.crop((x0, crop_top, x1, h - crop_bottom))
                for ln in col.extract_text_lines(x_tolerance=1.5):
                    txt = ln["text"].rstrip()
                    if not txt:
                        continue
                    meta = {"page": i, "col": ci, "x0": x0, "x1": x1,
                            "top": ln["top"], "bottom": ln["bottom"]}
                    out.append((meta, txt))
    return out


def clean_lines(lines, noise_patterns, estilo="fgv"):
    """Remove ruído e isola marcadores de texto de apoio em linhas próprias."""
    noise_re = re.compile("|".join(noise_patterns))
    out = []
    for meta, ln in lines:
        ln = noise_re.sub(" ", ln)
        if estilo == "fcc":
            # correções de OCR no início de linha: "t0." -> "10."
            ln = re.sub(r"^\s*[tl](\d)\s*\.", r"1\1.", ln)
        parts = APOIO_RE.split(ln)
        if len(parts) == 1:
            if ln.strip():
                out.append((meta, ln.strip()))
        else:
            # split retorna [antes, palavra_numero, depois, ...]
            i = 0
            if parts[0].strip():
                out.append((meta, parts[0].strip()))
            while i + 1 < len(parts):
                word, after = parts[i + 1], parts[i + 2]
                out.append((meta, f"@@APOIO {word}"))
                if after.strip():
                    out.append((meta, after.strip()))
                i += 2
    return out


def disciplina_de(numero, faixas):
    for ini, fim, nome in faixas:
        if ini <= numero <= fim:
            return nome
    return None


def parse_questoes(lines, cfg):
    n_total = cfg["n_questoes"]
    estilo = cfg.get("estilo", "fgv")
    questoes = []
    current = None
    expected = 1
    apoio_atual = None   # FGV: {"texto", "restantes"} | FCC: {"texto", "numeros"}
    # CEBRASPE: o comando ("... julgue os itens a seguir") e os textos de apoio
    # vêm em blocos separados por espaço em branco, sem marcador nenhum. O que
    # cai entre um item e o próximo vira o apoio corrente, que vale até que
    # outro bloco apareça.
    gap_apoio = cfg.get("gap_apoio", 6.0)
    bloco_pendente = []          # linhas do bloco que ainda não virou apoio
    metas_pendentes = []
    apoio_corrente = None
    prev_meta = prev_txt = None

    def close_current():
        if current is not None:
            questoes.append(current)

    def apoio_para(num):
        """Devolve o texto de apoio da questão `num` e faz a limpeza do estado."""
        nonlocal apoio_atual
        if not apoio_atual:
            return None
        if "numeros" in apoio_atual:              # FCC: faixa explícita
            maior = max(apoio_atual["numeros"])
            if num in apoio_atual["numeros"]:
                t = " ".join(apoio_atual["texto"]).strip()
                if num >= maior:
                    apoio_atual = None
                return t
            if num > maior:
                apoio_atual = None
            return None
        if apoio_atual["restantes"] > 0:          # FGV: próximas N questões
            t = " ".join(apoio_atual["texto"]).strip()
            apoio_atual["restantes"] -= 1
            if apoio_atual["restantes"] == 0:
                apoio_atual = None
            return t
        return None

    for meta, ln in lines:
        stripped = ln.strip()
        if not stripped:
            continue
        if estilo == "cespe":
            # o item só termina em fim de frase; a partir daí, um espaço maior
            # (ou a virada de coluna/página) indica que começou outro bloco
            if prev_txt is not None and TERM_RE.search(prev_txt):
                mudou_coluna = (prev_meta["page"] != meta["page"]
                                or prev_meta["col"] != meta["col"])
                if (mudou_coluna
                        or meta["top"] - prev_meta["bottom"] > gap_apoio):
                    close_current()
                    current = None
            prev_meta, prev_txt = meta, stripped
        if stripped.startswith("@@APOIO"):
            close_current()
            current = None
            word = stripped.split()[1].lower()
            apoio_atual = {"texto": [], "restantes": NUM_WORDS.get(word, 1)}
            continue
        if estilo == "fcc":
            m_at = FCC_ATENCAO_RE.match(stripped)
            if m_at:
                close_current()
                current = None
                ini = int(m_at.group(1))
                fim = int(m_at.group(2)) if m_at.group(2) else ini
                apoio_atual = {"texto": [stripped],
                               "numeros": set(range(ini, fim + 1))}
                continue
        # alguns cadernos têm erro de diagramação no número da questão
        # (ex.: EPE 2024 imprime o código interno no lugar do "64")
        extras = cfg.get("marcadores_extra", {})
        if stripped in extras and extras[stripped] == expected:
            stripped = str(expected)
        resto_inicial = None
        inicia = False
        if estilo == "cespe":
            m_ce = CESPE_NUM_RE.match(stripped)
            if (m_ce and expected <= n_total
                    and int(m_ce.group(1)) == expected):
                inicia = True
                resto_inicial = m_ce.group(2).strip()
        elif estilo == "fcc":
            m_num = FCC_NUM_OCR_RE.match(stripped)
            num_visto = None
            if m_num and expected <= n_total:
                token = m_num.group(1)
                for delta in range(0, 4):
                    if token_ocr_igual(token, expected + delta):
                        num_visto = expected + delta
                        resto_inicial = m_num.group(2).strip()
                        break
            if num_visto is None and expected <= n_total:
                # número sem o ponto ("42 Uma Prefeitura..."): aceita apenas
                # o número exato esperado, seguido de letra maiúscula
                m_sp = re.match(r"^(\d{1,3})\s+([A-ZÀ-Ü].*)$", stripped)
                if m_sp and int(m_sp.group(1)) == expected:
                    num_visto = expected
                    resto_inicial = m_sp.group(2).strip()
            if num_visto is not None:
                # marcadores perdidos no OCR viram placeholders
                while expected < num_visto:
                    if current is not None:
                        current["_forcar_revisar"] = True
                    metas_prev = (list(current["_metas"])
                                  if current else [meta])
                    close_current()
                    questoes.append({
                        "numero": expected,
                        "pagina": meta["page"],
                        "texto_apoio": None,
                        "enunciado_linhas": [
                            "[questão não extraída do PDF — o número se "
                            "perdeu no OCR; confira o recorte da questão "
                            "anterior ou o PDF original]"],
                        "alternativas": {},
                        "_alt_atual": None,
                        "_metas": metas_prev,
                        "_forcar_revisar": True,
                    })
                    current = None
                    expected += 1
                inicia = True
        elif (stripped.isdigit() and int(stripped) == expected
                and expected <= n_total):
            inicia = True
        if inicia:
            close_current()
            metas_do_apoio = []
            if estilo == "cespe":
                if bloco_pendente:
                    apoio_corrente = " ".join(bloco_pendente).strip() or None
                    # só o primeiro item do bloco carrega o recorte do apoio:
                    # é ali que ficam a planilha, o e-mail, o texto etc.
                    metas_do_apoio = metas_pendentes
                    bloco_pendente, metas_pendentes = [], []
                apoio = apoio_corrente
            else:
                apoio = apoio_para(expected)
            current = {
                "numero": expected,
                "pagina": meta["page"],
                "texto_apoio": apoio,
                "enunciado_linhas": ([resto_inicial] if resto_inicial else []),
                "alternativas": {},
                "_alt_atual": None,
                "_metas": [meta],
                "_metas_apoio": metas_do_apoio,
            }
            expected += 1
            continue
        if current is None:
            if estilo == "cespe":
                bloco_pendente.append(stripped)
                metas_pendentes.append(meta)
            elif apoio_atual is not None:
                apoio_atual["texto"].append(stripped)
            continue
        current["_metas"].append(meta)
        m = ALT_RE.match(stripped)
        if m is None:
            prox_letra = ("A" if current["_alt_atual"] is None
                          else chr(ord(current["_alt_atual"]) + 1))
            if prox_letra <= "E":
                # "(C) ..." colado no fim da linha anterior (ex.: citação entre
                # parênteses): só aceita a próxima letra esperada
                idx = stripped.find(f"({prox_letra})")
                if idx > 0:
                    antes = stripped[:idx].strip()
                    if antes:
                        if current["_alt_atual"]:
                            current["alternativas"][current["_alt_atual"]].append(antes)
                        else:
                            current["enunciado_linhas"].append(antes)
                    stripped = stripped[idx:]
                    m = ALT_RE.match(stripped)
                elif cfg.get("estilo") == "fcc":
                    # OCR corrompeu a letra da alternativa: "(6)"=C, "(4)"=A,
                    # "(Cc)", ou parêntese sem fechar "(A texto..." — só
                    # aceita se o caractere for confusão plausível da próxima
                    m_ocr = re.match(r"^\(([^)\s]{1,2})\)\s?(.*)$", stripped)
                    if m_ocr and m_ocr.group(1)[0] in OCR_LETRAS[prox_letra]:
                        stripped = f"({prox_letra}) {m_ocr.group(2)}"
                        m = ALT_RE.match(stripped)
                    else:
                        m_sf = re.match(
                            rf"^\({prox_letra}\s+(\S.*)$", stripped)
                        if m_sf:
                            stripped = f"({prox_letra}) {m_sf.group(1)}"
                            m = ALT_RE.match(stripped)
        if m:
            letra, resto = m.group(1), m.group(2)
            current["alternativas"][letra] = [resto] if resto else []
            current["_alt_atual"] = letra
        elif current["_alt_atual"]:
            current["alternativas"][current["_alt_atual"]].append(stripped)
        else:
            current["enunciado_linhas"].append(stripped)

    close_current()

    out = []
    gab = cfg["gabarito"]
    for q in questoes:
        num = q["numero"]
        enunciado = "\n".join(q["enunciado_linhas"]).strip()
        if estilo == "cespe":
            # itens certo/errado: as alternativas não estão impressas no caderno
            alts = dict(CESPE_ALTS)
        else:
            alts = {k: " ".join(v).strip() for k, v in q["alternativas"].items()}
        resposta = gab[num - 1] if num <= len(gab) else None
        anulada = resposta in ("*", "X")
        texto_completo = re.sub(
            r"\s+", " ", " ".join([enunciado] + list(alts.values())))
        enunciado_flat = re.sub(r"\s+", " ", enunciado)
        if estilo == "cespe":
            # sem alternativas impressas, o que sobra é fórmula/figura no PDF
            revisar = bool(MATH_RE.search(enunciado_flat)
                           or FIG_RE.search(enunciado_flat)
                           or not enunciado
                           or num in cfg.get("revisar_extra", ()))
        else:
            revisar = bool(MATH_RE.search(texto_completo)
                           or FIG_RE.search(enunciado_flat)
                           or len(alts) < 5
                           or any(not v for v in alts.values())
                           or q.get("_forcar_revisar"))
        out.append({
            "numero": num,
            "pagina": q["pagina"],
            "disciplina": disciplina_de(num, cfg["disciplinas"]),
            "assunto": None,  # preenchido na curadoria
            "texto_apoio": q["texto_apoio"],
            "enunciado": enunciado,
            "alternativas": alts,
            "gabarito": None if anulada else resposta,
            "anulada": anulada,
            # fórmula/tabela/figura que o parser de texto não captura bem,
            # ou alternativas incompletas (OCR ruim) — o recorte PNG cobre
            "revisar": revisar,
            "imagens": [],
            "_metas": q["_metas"],
            "_metas_apoio": q.get("_metas_apoio") or [],
        })
    return out


def segmentos(metas):
    """Agrupa as linhas de uma questão em trechos contíguos por (página, coluna)."""
    segs = []
    for m in metas:
        if segs and segs[-1]["page"] == m["page"] and segs[-1]["col"] == m["col"]:
            segs[-1]["top"] = min(segs[-1]["top"], m["top"])
            segs[-1]["bottom"] = max(segs[-1]["bottom"], m["bottom"])
        else:
            segs.append({"page": m["page"], "col": m["col"],
                         "x0": m["x0"], "x1": m["x1"],
                         "top": m["top"], "bottom": m["bottom"]})
    return segs


def render_questoes(questoes, cfg, chave, pdf_path):
    """Gera PNGs das regiões (página/coluna) das questões marcadas `revisar`.

    O trecho de cada questão vai até o início da questão seguinte quando ela
    está na mesma coluna; caso contrário, até o fim da coluna — isso garante
    que figuras sem texto (imagens de código, tabelas) entrem no recorte.
    """
    alvo = [q for q in questoes if q["revisar"]]
    if not alvo:
        return
    out_dir = IMG_DIR / chave
    if out_dir.exists():
        for f in out_dir.glob("*.png"):
            f.unlink()
    out_dir.mkdir(parents=True, exist_ok=True)

    with pdfplumber.open(pdf_path) as pdf:
        for idx, q in enumerate(questoes):
            if not q["revisar"]:
                continue
            # o comando/texto de apoio (planilha, e-mail, texto base) entra no
            # recorte junto com o item que o inaugura
            segs = segmentos(q.get("_metas_apoio", []) + q["_metas"])
            prox = questoes[idx + 1] if idx + 1 < len(questoes) else None
            prox_meta = (prox.get("_metas_apoio") or prox["_metas"])[0] if prox else None
            ant = questoes[idx - 1] if idx else None
            ant_meta = ant["_metas"][-1] if ant else None
            for si, s in enumerate(segs):
                page = pdf.pages[s["page"] - 1]
                col_fim = page.height - cfg["crop_bottom"]
                ultimo = si == len(segs) - 1
                if (ultimo and prox_meta
                        and prox_meta["page"] == s["page"]
                        and prox_meta["col"] == s["col"]):
                    bottom = prox_meta["top"] - 2
                else:
                    # questão termina a coluna: desce até o último objeto
                    # gráfico (figura/tabela) abaixo do texto, se houver
                    bottom = s["bottom"]
                    objetos = (page.images + page.rects
                               + page.lines + page.curves)
                    larg_col = s["x1"] - s["x0"]
                    for ob in objetos:
                        # só objetos contidos na coluna (exclui a régua do
                        # rodapé e bordas, que atravessam a página inteira)
                        if (ob["x0"] >= s["x0"] - 5 and ob["x1"] <= s["x1"] + 5
                                and (ob["x1"] - ob["x0"]) <= larg_col
                                and ob["top"] >= s["top"]
                                and ob["bottom"] <= col_fim):
                            bottom = max(bottom, ob["bottom"])
                    bottom += 8
                topo = max(s["top"] - 4, cfg["crop_top"])
                if si == 0 and q.get("_metas_apoio"):
                    # o apoio pode começar por uma figura sem texto (planilha,
                    # e-mail): sobe até o fim da questão anterior na coluna
                    limite = cfg["crop_top"]
                    if (ant_meta and ant_meta["page"] == s["page"]
                            and ant_meta["col"] == s["col"]):
                        limite = ant_meta["bottom"] + 2
                    topo = max(min(topo, limite), cfg["crop_top"])
                base = min(bottom, col_fim)
                if base <= topo + 4:
                    continue  # região degenerada (ex.: placeholder de OCR)
                crop = page.crop((s["x0"], topo, s["x1"], base))
                nome = f"q{q['numero']:02d}-{si}.png"
                crop.to_image(resolution=RENDER_DPI).save(out_dir / nome)
                q["imagens"].append(f"img/{chave}/{nome}")
            if not q["imagens"]:
                # região degenerada (marcador perdido no OCR etc.):
                # renderiza a página inteira como último recurso
                page = pdf.pages[q["pagina"] - 1]
                crop = page.crop((0, cfg["crop_top"], page.width,
                                  page.height - cfg["crop_bottom"]))
                nome = f"q{q['numero']:02d}-pagina.png"
                crop.to_image(resolution=RENDER_DPI).save(out_dir / nome)
                q["imagens"].append(f"img/{chave}/{nome}")


CADERNO_RE = re.compile(r"\b(\d{3})(?:CB\d|\d{3})_\d")


def conferir_caderno(pdf_path, cfg):
    """Confere que a prova é do caderno de onde veio o gabarito do config.

    Bancas que aplicam a mesma prova em datas diferentes publicam um gabarito
    por caderno (o INSS 2022 teve o 760, de 27/11, e o 787, de 11/12). Parear
    errado não quebra nada — a extração valida, o app funciona — e o gabarito
    fica trocado em dezenas de itens sem nenhum sinal. Daí a conferência ser
    explícita. Lê o topo da página, que o `crop_top` descarta na extração.
    """
    caderno = cfg.get("caderno")
    if not caderno:
        return None
    achados = set()
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages[:3]:
            faixa = page.crop((0, 0, page.width, min(cfg["crop_top"] + 10,
                                                     page.height)))
            achados.update(CADERNO_RE.findall(faixa.extract_text() or ""))
    if caderno in achados:
        return None
    return (f"caderno esperado {caderno} não aparece no cabeçalho do PDF"
            f" (achei: {sorted(achados) or 'nenhum'}) — o gabarito do config"
            f" pode ser de outra aplicação")


def validar(questoes, cfg):
    problemas = []
    esperadas = (["C", "E"] if cfg.get("estilo") == "cespe"
                 else ["A", "B", "C", "D", "E"])
    numeros = [q["numero"] for q in questoes]
    faltando = sorted(set(range(1, cfg["n_questoes"] + 1)) - set(numeros))
    if faltando:
        problemas.append(f"questões faltando: {faltando}")
    for q in questoes:
        letras = sorted(q["alternativas"].keys())
        if letras != esperadas:
            problemas.append(f"q{q['numero']}: alternativas {letras}")
        if not q["enunciado"]:
            problemas.append(f"q{q['numero']}: enunciado vazio")
        if q["revisar"] and not q["imagens"]:
            problemas.append(f"q{q['numero']}: marcada para revisão sem imagem")
    return problemas


def main():
    chave = sys.argv[1] if len(sys.argv) > 1 else "fgv-2024-dataprev-inteligencia"
    cfg = PROVAS[chave]
    pdf_path = PDF_DIR / cfg["pdf"]

    SILVER.mkdir(parents=True, exist_ok=True)
    GOLD.mkdir(parents=True, exist_ok=True)

    lines = extract_lines(pdf_path, cfg["crop_top"], cfg["crop_bottom"],
                          cfg.get("colunas", 2),
                          cfg.get("colunas_por_pagina"))
    (SILVER / f"{chave}.txt").write_text(
        "\n".join(f"[p{m['page']}c{m['col']}] {ln}" for m, ln in lines),
        encoding="utf-8")

    problema_caderno = conferir_caderno(pdf_path, cfg)

    lines = clean_lines(lines, cfg["noise"], cfg.get("estilo", "fgv"))
    questoes = parse_questoes(lines, cfg)
    render_questoes(questoes, cfg, chave, pdf_path)
    problemas = validar(questoes, cfg)
    if problema_caderno:
        problemas.insert(0, problema_caderno)

    for q in questoes:
        del q["_metas"]
        q.pop("_metas_apoio", None)

    doc = {
        "prova": chave,
        "banca": cfg["banca"],
        "ano": cfg["ano"],
        "orgao": cfg["orgao"],
        "cargo": cfg["cargo"],
        "tipo": cfg["tipo"],
        # "abcde" (múltipla escolha) ou "ce" (certo/errado, estilo Cebraspe)
        "formato": cfg.get("formato", "abcde"),
        "pdf": cfg["pdf"],
        "questoes": questoes,
    }
    out = GOLD / f"{chave}.json"
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")

    n_rev = sum(q["revisar"] for q in questoes)
    n_img = sum(len(q["imagens"]) for q in questoes)
    print(f"extraídas: {len(questoes)}/{cfg['n_questoes']} questões -> {out}")
    print(f"para revisão: {n_rev} questões, {n_img} imagens renderizadas")
    if problemas:
        print("PROBLEMAS:")
        for p in problemas:
            print(" -", p)
    else:
        print("validação OK")


if __name__ == "__main__":
    main()
