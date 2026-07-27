"use strict";

/* Treino Concursos — versão estática.
   Sem backend: as questões vêm de dados/questoes.json e todo o histórico
   (tentativas, repetição espaçada e redações) vive no localStorage deste
   aparelho. A lógica abaixo é a mesma do app FastAPI, portada para o cliente. */

const $ = (id) => document.getElementById(id);

// intervalos da repetição espaçada (dias até rever, por acertos consecutivos)
const INTERVALOS_REVISAO = [1, 3, 7, 15];

const CHAVES = {
  tentativas: "tc.tentativas",
  redacoes: "tc.redacoes",
  apiKey: "tc.geminiKey",
  semeado: "tc.semeado",
};

let DADOS = null;               // conteúdo de dados/questoes.json
const PROVAS = new Map();       // id -> prova
const QUESTOES = new Map();     // id -> questão

const estado = { fila: [], indice: 0, acertos: 0, respondidas: 0 };

// ---------- persistência ----------
function ler(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch {
    alert("Não consegui salvar no aparelho — o armazenamento do navegador " +
          "pode estar cheio ou bloqueado (janela anônima).");
    return false;
  }
}

const lerTentativas = () => ler(CHAVES.tentativas, []);
const lerRedacoes = () => ler(CHAVES.redacoes, []);

// SQLite grava "2026-07-18 11:20:00" (hora local); o app grava ISO com fuso
function parseData(s) {
  if (!s) return new Date(0);
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  return isNaN(d) ? new Date(0) : d;
}

const fmtData = (d) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ` +
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// ---------- carregamento ----------
async function carregarDados() {
  const r = await fetch("dados/questoes.json");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  DADOS = await r.json();

  for (const p of DADOS.provas) PROVAS.set(p.id, p);
  for (const q of DADOS.questoes) QUESTOES.set(q.id, q);

  // primeira abertura: traz o histórico que já existia no PC
  if (!ler(CHAVES.semeado, false)) {
    const iniciais = (DADOS.tentativas_iniciais || []).map((t) => ({
      questao_id: t.questao_id,
      resposta: t.resposta,
      correta: t.correta,
      respondida_em: parseData(t.respondida_em).toISOString(),
    }));
    if (iniciais.length && !lerTentativas().length) {
      gravar(CHAVES.tentativas, iniciais);
    }
    gravar(CHAVES.semeado, true);
  }
}

// ---------- navegação entre telas ----------
const TELAS = ["tela-carregando", "tela-filtros", "tela-questao", "tela-fim",
               "tela-stats", "tela-redacao", "tela-ajustes"];

function mostrar(tela) {
  TELAS.forEach((t) => $(t).classList.toggle("oculto", t !== tela));
  const treino = ["tela-filtros", "tela-questao", "tela-fim"].includes(tela);
  $("nav-treino").classList.toggle("active", treino);
  $("nav-redacao").classList.toggle("active", tela === "tela-redacao");
  $("nav-stats").classList.toggle("active", tela === "tela-stats");
  $("nav-ajustes").classList.toggle("active", tela === "tela-ajustes");
  window.scrollTo({ top: 0 });
}

// ---------- filtros ----------
function montarFiltros() {
  for (const p of DADOS.provas) {
    $("f-prova").add(
      new Option(`${p.banca} ${p.ano} - ${p.orgao} (${p.cargo})`, p.id));
  }
  const porDisciplina = new Map();
  for (const q of DADOS.questoes) {
    porDisciplina.set(q.disciplina, (porDisciplina.get(q.disciplina) || 0) + 1);
  }
  for (const [disc, n] of porDisciplina) {
    $("f-disciplina").add(new Option(`${disc} (${n})`, disc));
  }
  preencherAssuntos();
}

function preencherAssuntos() {
  const disc = $("f-disciplina").value;
  const sel = $("f-assunto");
  sel.length = 1; // mantém "Todos"
  const contagem = new Map();
  for (const q of DADOS.questoes) {
    if (!q.assunto) continue;
    if (disc && q.disciplina !== disc) continue;
    contagem.set(q.assunto, (contagem.get(q.assunto) || 0) + 1);
  }
  for (const a of [...contagem.keys()].sort()) {
    sel.add(new Option(`${a} (${contagem.get(a)})`, a));
  }
}

// ---------- seleção de questões ----------
function ultimaTentativaPorQuestao() {
  const ultima = new Map();
  for (const t of lerTentativas()) ultima.set(t.questao_id, t);
  return ultima;
}

function filtrar({ provaId, disciplina, assunto, modo }) {
  const ultima = ultimaTentativaPorQuestao();
  return DADOS.questoes.filter((q) => {
    if (provaId && q.prova_id !== Number(provaId)) return false;
    if (disciplina && q.disciplina !== disciplina) return false;
    if (assunto && q.assunto !== assunto) return false;
    if (modo === "nao_respondidas") return !ultima.has(q.id);
    if (modo === "erradas") {
      const t = ultima.get(q.id);
      return t && !t.correta;
    }
    return true;
  });
}

function embaralhar(lista) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Questões devidas na repetição espaçada — porte fiel de _revisoes_devidas():
   só entra no ciclo quem já errou alguma vez; a cada acerto consecutivo o
   intervalo cresce (1, 3, 7, 15 dias) e depois a questão "gradua". */
function revisoesDevidas() {
  const hist = new Map();
  for (const t of lerTentativas()) {
    if (!hist.has(t.questao_id)) hist.set(t.questao_id, []);
    hist.get(t.questao_id).push(t);
  }
  const agora = Date.now();
  const devidas = [];
  for (const [qid, ts] of hist) {
    if (!QUESTOES.has(qid)) continue;          // questão saiu do banco
    if (!ts.some((t) => !t.correta)) continue; // nunca errou: fora do ciclo
    let streak = 0;
    for (let i = ts.length - 1; i >= 0 && ts[i].correta; i--) streak++;
    if (streak >= INTERVALOS_REVISAO.length) continue; // graduou
    const ultima = parseData(ts[ts.length - 1].respondida_em).getTime();
    const atraso = (agora - ultima) / 86400000 - INTERVALOS_REVISAO[streak];
    if (atraso >= 0) devidas.push({ atraso, qid });
  }
  devidas.sort((a, b) => b.atraso - a.atraso);
  return devidas;
}

// ---------- sessões ----------
function iniciarComFila(fila, mensagemVazia) {
  if (!fila.length) {
    $("filtros-vazio").textContent = mensagemVazia;
    $("filtros-vazio").classList.remove("oculto");
    return;
  }
  $("filtros-vazio").classList.add("oculto");
  Object.assign(estado, { fila, indice: 0, acertos: 0, respondidas: 0 });
  mostrar("tela-questao");
  renderQuestao();
}

function lerFiltros() {
  return {
    provaId: $("f-prova").value,
    disciplina: $("f-disciplina").value,
    assunto: $("f-assunto").value,
    modo: $("f-modo").value,
    limit: Number($("f-limit").value),
  };
}

function iniciarSessao() {
  const f = lerFiltros();
  const fila = embaralhar(filtrar(f)).slice(0, f.limit);
  iniciarComFila(fila, "Nenhuma questão encontrada com esses filtros.");
}

function iniciarSessaoDoDia() {
  const f = lerFiltros();
  const questoes = [];
  for (const { qid } of revisoesDevidas().slice(0, f.limit)) {
    questoes.push({ ...QUESTOES.get(qid), origem: "revisao" });
  }
  const resto = f.limit - questoes.length;
  if (resto > 0) {
    const novas = filtrar({ ...f, modo: "nao_respondidas" });
    for (const q of embaralhar(novas).slice(0, resto)) {
      questoes.push({ ...q, origem: "nova" });
    }
  }
  iniciarComFila(
    embaralhar(questoes),
    "Nada para hoje com esses filtros — nem revisões devidas, nem questões novas.");
}

function atualizarAvisoRevisoes() {
  const n = revisoesDevidas().length;
  $("sd-info").textContent = n > 0
    ? `${n} questão(ões) esperando revisão espaçada (1, 3, 7 e 15 dias) + ` +
      `questões novas para completar.`
    : "Mistura automática: revisão espaçada das que você errou " +
      "(1, 3, 7 e 15 dias) + questões novas.";
}

// ---------- questão ----------
function renderQuestao() {
  const q = estado.fila[estado.indice];
  const prova = PROVAS.get(q.prova_id) || {};

  $("q-progresso").textContent =
    `Questão ${estado.indice + 1} de ${estado.fila.length}` +
    (estado.respondidas ? ` · ${estado.acertos}/${estado.respondidas} acertos na sessão` : "");
  $("q-meta").textContent =
    `${prova.banca} ${prova.ano} · ${prova.orgao} · Q${q.numero} · ` +
    `${q.assunto || q.disciplina}` +
    (q.origem === "revisao" ? " · 🔁 revisão" : "");

  const imagens = q.imagens || [];
  const temImagens = imagens.length > 0;

  $("q-revisar").classList.toggle("oculto", !q.revisar || temImagens);
  if (q.revisar && !temImagens) {
    $("q-revisar").textContent =
      `⚠️ Esta questão tem fórmula, código ou tabela que só aparece no PDF ` +
      `(${prova.pdf}, página ${q.pagina}) — confira o enunciado original antes de responder.`;
  }

  const contImg = $("q-imagens");
  contImg.innerHTML = "";
  for (const src of imagens) {
    const img = document.createElement("img");
    img.src = src;               // dados já vêm com o caminho img/<prova>/...
    img.loading = "lazy";
    img.alt = `Questão ${q.numero} (recorte do PDF)`;
    contImg.append(img);
  }

  if (q.texto_apoio) {
    $("q-apoio").classList.remove("oculto");
    $("q-apoio").open = false;
    $("q-apoio-texto").textContent = q.texto_apoio;
  } else {
    $("q-apoio").classList.add("oculto");
  }

  // o recorte do PDF já contém o enunciado; o texto extraído fica oculto
  $("q-enunciado").textContent = temImagens ? "" : q.enunciado;

  /* Quando a questão tem recorte do PDF, as alternativas estão na imagem e o
     texto extraído pode estar vazio ou incompleto: nesse caso desenhamos as
     cinco letras para você escolher lendo o recorte. Sem imagem, só aparecem
     as alternativas que têm texto — desenhar uma vazia entregaria o gabarito. */
  const alts = q.alts || {};
  const letras = temImagens
    ? ["A", "B", "C", "D", "E"]
    : ["A", "B", "C", "D", "E"].filter((l) => alts[l]);

  const cont = $("q-alternativas");
  cont.innerHTML = "";
  for (const letra of letras) {
    const btn = document.createElement("button");
    btn.className = "alternativa";
    btn.dataset.letra = letra;
    btn.innerHTML = `<span class="letra">(${letra})</span>`;
    if (alts[letra]) btn.append(alts[letra]);
    else btn.classList.add("so-letra");
    btn.addEventListener("click", () => responder(q, letra));
    cont.append(btn);
  }
  $("q-feedback").classList.add("oculto");
  $("q-justificativa").classList.add("oculto");
  $("btn-proxima").classList.add("oculto");
}

function responder(q, letra) {
  document.querySelectorAll(".alternativa").forEach((b) => (b.disabled = true));

  const correta = letra === q.gabarito;
  const tentativas = lerTentativas();
  tentativas.push({
    questao_id: q.id,
    resposta: letra,
    correta: correta ? 1 : 0,
    respondida_em: new Date().toISOString(),
  });
  gravar(CHAVES.tentativas, tentativas);

  estado.respondidas++;
  if (correta) estado.acertos++;

  document.querySelectorAll(".alternativa").forEach((b) => {
    if (b.dataset.letra === q.gabarito) b.classList.add("certa");
    else if (b.dataset.letra === letra) b.classList.add("errada");
  });

  const fb = $("q-feedback");
  fb.classList.remove("oculto", "ok", "erro");
  fb.classList.add(correta ? "ok" : "erro");
  fb.textContent = correta ? "✅ Acertou!" : `❌ Errou — gabarito: (${q.gabarito})`;

  const just = $("q-justificativa");
  just.classList.toggle("oculto", !q.justificativa);
  if (q.justificativa) just.textContent = q.justificativa;

  $("btn-proxima").classList.remove("oculto");
  $("btn-proxima").textContent =
    estado.indice + 1 >= estado.fila.length ? "Ver resumo →" : "Próxima →";
  $("q-progresso").textContent =
    `Questão ${estado.indice + 1} de ${estado.fila.length}` +
    ` · ${estado.acertos}/${estado.respondidas} acertos na sessão`;
}

function proxima() {
  if (estado.indice + 1 >= estado.fila.length) return encerrar();
  estado.indice++;
  renderQuestao();
}

function encerrar() {
  const { acertos, respondidas } = estado;
  const pct = respondidas ? Math.round((100 * acertos) / respondidas) : 0;
  $("fim-resumo").textContent = respondidas
    ? `Você respondeu ${respondidas} questões e acertou ${acertos} (${pct}%).`
    : "Nenhuma questão respondida nesta sessão.";
  const erradas = respondidas - acertos;
  $("fim-agenda").textContent = erradas
    ? `As ${erradas} que você errou voltam amanhã na Sessão do dia.`
    : "";
  atualizarAvisoRevisoes();
  mostrar("tela-fim");
}

// ---------- desempenho ----------
function carregarStats() {
  const tentativas = lerTentativas();
  const total = tentativas.length;
  const acertos = tentativas.reduce((s, t) => s + (t.correta ? 1 : 0), 0);
  const distintas = new Set(tentativas.map((t) => t.questao_id)).size;
  const pctG = total ? Math.round((100 * acertos) / total) : 0;

  $("stats-geral").textContent = total
    ? `${total} tentativas · ${distintas} questões distintas · ${pctG}% de acerto geral`
    : "Nenhuma tentativa registrada ainda — faça uma sessão de treino primeiro.";

  const pendentes = revisoesDevidas().length;
  $("stats-revisao").textContent = pendentes
    ? `🔁 ${pendentes} questão(ões) devidas na revisão espaçada.`
    : "";

  const porAssunto = new Map();
  for (const t of tentativas) {
    const q = QUESTOES.get(t.questao_id);
    if (!q) continue;
    const chave = q.assunto || q.disciplina;
    if (!porAssunto.has(chave)) porAssunto.set(chave, { t: 0, a: 0 });
    const reg = porAssunto.get(chave);
    reg.t++;
    if (t.correta) reg.a++;
  }

  const linhas = [...porAssunto.entries()]
    .map(([assunto, r]) => ({ assunto, ...r, pct: (100 * r.a) / r.t }))
    .sort((x, y) => x.pct - y.pct);

  const tbody = $("stats-tabela").querySelector("tbody");
  tbody.innerHTML = "";
  for (const l of linhas) {
    const pct = Math.round(l.pct);
    const cls = pct < 60 ? "pct-baixa" : pct < 80 ? "pct-media" : "pct-alta";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${l.assunto}</td><td>${l.t}</td><td>${l.a}</td>` +
                   `<td class="${cls}">${pct}%</td>`;
    tbody.append(tr);
  }
  mostrar("tela-stats");
}

// ---------- redação ----------
const red = { temas: [], timerId: null, restante: 60 * 60, aberta: null };

function carregarRedacao() {
  if (!red.temas.length) {
    red.temas = DADOS.temas_redacao || [];
    for (const t of red.temas) $("red-tema").add(new Option(t.titulo, t.id));
    $("red-tema").addEventListener("change", mostrarComando);
    mostrarComando();
  }
  listarRedacoes();
  $("red-editor").classList.remove("oculto");
  $("red-view").classList.add("oculto");
  mostrar("tela-redacao");
}

function mostrarComando() {
  const t = red.temas.find((x) => String(x.id) === $("red-tema").value);
  $("red-comando").textContent = t ? t.comando : "";
}

function atualizarContagem() {
  const txt = $("red-texto").value.trim();
  const palavras = txt ? txt.split(/\s+/).length : 0;
  const linhas = Math.ceil(txt.length / 70); // ~70 caracteres por linha FCC
  $("red-contagem").textContent = `${palavras} palavras · ~${linhas} linhas`;
}

function tickTimer() {
  red.restante--;
  const m = String(Math.floor(red.restante / 60)).padStart(2, "0");
  const s = String(red.restante % 60).padStart(2, "0");
  $("red-timer").textContent = `${m}:${s}`;
  if (red.restante <= 0) {
    clearInterval(red.timerId);
    red.timerId = null;
    $("red-timer").textContent = "⏰ TEMPO!";
    $("red-timer-btn").textContent = "▶ Cronômetro (60 min)";
  }
}

function toggleTimer() {
  if (red.timerId) {
    clearInterval(red.timerId);
    red.timerId = null;
    $("red-timer-btn").textContent = "▶ Retomar";
  } else {
    if (red.restante <= 0) red.restante = 60 * 60;
    red.timerId = setInterval(tickTimer, 1000);
    $("red-timer-btn").textContent = "⏸ Pausar";
  }
}

function salvarRedacao() {
  const texto = $("red-texto").value.trim();
  if (texto.length < 50) {
    alert("Texto muito curto para salvar.");
    return;
  }
  const t = red.temas.find((x) => String(x.id) === $("red-tema").value);
  const redacoes = lerRedacoes();
  redacoes.push({
    id: Date.now(),
    tema: t ? t.comando : "Tema livre",
    titulo: t ? t.titulo : "Tema livre",
    texto,
    palavras: texto.split(/\s+/).length,
    criada_em: new Date().toISOString(),
    correcao: null,
    nota: null,
  });
  if (!gravar(CHAVES.redacoes, redacoes)) return;

  $("red-texto").value = "";
  atualizarContagem();
  if (red.timerId) toggleTimer();
  red.restante = 60 * 60;
  $("red-timer").textContent = "60:00";
  $("red-timer-btn").textContent = "▶ Cronômetro (60 min)";
  listarRedacoes();
  alert("Redação salva! Clique nela na lista para ver ou corrigir com IA.");
}

function listarRedacoes() {
  const redacoes = lerRedacoes().slice().reverse();
  const tbody = $("red-tabela").querySelector("tbody");
  tbody.innerHTML = "";
  $("red-vazio").classList.toggle("oculto", redacoes.length > 0);
  for (const x of redacoes) {
    const tr = document.createElement("tr");
    tr.className = "red-linha";
    const nota = x.nota != null ? x.nota.toFixed(1)
      : (x.correcao ? "—" : "sem correção");
    tr.innerHTML =
      `<td>${fmtData(parseData(x.criada_em))}</td>` +
      `<td>${x.titulo || x.tema.slice(0, 40)}</td>` +
      `<td>${x.palavras}</td><td>${nota}</td>`;
    tr.addEventListener("click", () => abrirRedacao(x.id));
    tbody.append(tr);
  }
}

function abrirRedacao(id) {
  const x = lerRedacoes().find((r) => r.id === id);
  if (!x) return;
  red.aberta = id;
  $("red-view-tema").textContent = x.tema;
  $("red-view-texto").textContent = x.texto;
  const cor = $("red-view-correcao");
  if (x.correcao) {
    cor.textContent = x.correcao;
    cor.classList.remove("oculto");
    $("red-corrigir").textContent = "Corrigir de novo com IA";
  } else {
    cor.classList.add("oculto");
    $("red-corrigir").textContent = "Corrigir com IA";
  }
  $("red-editor").classList.add("oculto");
  $("red-view").classList.remove("oculto");
  window.scrollTo({ top: 0 });
}

function apagarRedacao() {
  if (!confirm("Apagar esta redação? Não dá para desfazer.")) return;
  gravar(CHAVES.redacoes, lerRedacoes().filter((r) => r.id !== red.aberta));
  $("red-view").classList.add("oculto");
  $("red-editor").classList.remove("oculto");
  listarRedacoes();
}

const SYSTEM_CORRECAO =
  "Você é um examinador experiente da banca FCC corrigindo a prova " +
  "discursiva (texto dissertativo-argumentativo) de um candidato ao " +
  "concurso da ABGF. Corrija com rigor e didática, no padrão FCC.\n" +
  "Estruture a correção assim:\nNOTA: X.X (de 0 a 10)\n\n" +
  "Depois, avalie em parágrafos curtos cada critério: (1) conteúdo e " +
  "desenvolvimento do tema (pertinência, profundidade, repertório); " +
  "(2) estrutura dissertativo-argumentativa (introdução com tese, " +
  "desenvolvimento, conclusão); (3) coesão e coerência (conectivos, " +
  "progressão); (4) domínio da norma-padrão (aponte cada erro gramatical " +
  "encontrado, citando o trecho e a forma correta). Feche com as 3 " +
  "melhorias mais importantes para a próxima redação. Responda em texto " +
  "corrido, sem markdown.";

async function corrigirRedacao() {
  const chave = localStorage.getItem(CHAVES.apiKey);
  if (!chave) {
    alert("Configure sua chave da API do Gemini em Ajustes para usar a " +
          "correção por IA.");
    return;
  }
  if (!navigator.onLine) {
    alert("A correção por IA precisa de internet. Suas redações continuam " +
          "salvas — corrija quando estiver conectado.");
    return;
  }
  const x = lerRedacoes().find((r) => r.id === red.aberta);
  if (!x) return;

  const btn = $("red-corrigir");
  btn.disabled = true;
  btn.textContent = "Corrigindo… (pode levar ~1 min)";
  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
                `gemini-3.1-flash-lite:generateContent?key=${encodeURIComponent(chave)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_CORRECAO }] },
        contents: [{ role: "user", parts: [{ text:
          `Tema proposto:\n${x.tema}\n\nRedação do candidato:\n${x.texto}` }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      alert(`Falha na correção: ${data?.error?.message || r.status}`);
      return;
    }
    const partes = data?.candidates?.[0]?.content?.parts || [];
    const correcao = partes.map((p) => p.text || "").join("").trim();
    if (!correcao) {
      alert("O modelo devolveu uma resposta vazia. Tente de novo.");
      return;
    }
    const m = correcao.match(/NOTA:\s*(\d+(?:[.,]\d+)?)/);
    const nota = m ? parseFloat(m[1].replace(",", ".")) : null;

    const redacoes = lerRedacoes();
    const alvo = redacoes.find((r) => r.id === red.aberta);
    alvo.correcao = correcao;
    alvo.nota = nota;
    gravar(CHAVES.redacoes, redacoes);

    $("red-view-correcao").textContent = correcao;
    $("red-view-correcao").classList.remove("oculto");
    listarRedacoes();
  } catch (e) {
    alert(`Falha na correção: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Corrigir de novo com IA";
  }
}

// ---------- ajustes ----------
function abrirAjustes() {
  const tentativas = lerTentativas();
  const redacoes = lerRedacoes();
  $("backup-resumo").textContent =
    `Hoje: ${tentativas.length} respostas e ${redacoes.length} redações ` +
    `guardadas neste aparelho.`;
  $("cfg-status").textContent = localStorage.getItem(CHAVES.apiKey)
    ? "✅ Chave salva neste aparelho." : "Nenhuma chave configurada.";
  $("cfg-chave").value = "";
  const geradoEm = DADOS.gerado_em ? parseData(DADOS.gerado_em) : null;
  const comJust = DADOS.questoes.filter((q) => q.justificativa).length;
  $("sobre-info").textContent =
    `${DADOS.questoes.length} questões de ${DADOS.provas.length} provas · ` +
    `${comJust} com justificativa · dados gerados em ` +
    `${geradoEm ? fmtData(geradoEm) : "—"}.`;
  mostrar("tela-ajustes");
}

function exportarBackup() {
  const backup = {
    app: "treino-concursos",
    versao: 1,
    exportado_em: new Date().toISOString(),
    tentativas: lerTentativas(),
    redacoes: lerRedacoes(),
  };
  const blob = new Blob([JSON.stringify(backup, null, 1)],
                        { type: "application/json" });
  const a = document.createElement("a");
  const hoje = new Date().toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob);
  a.download = `treino-concursos-backup-${hoje}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importarBackup(arquivo) {
  try {
    const backup = JSON.parse(await arquivo.text());
    if (!Array.isArray(backup.tentativas)) throw new Error("formato inesperado");

    // mescla por (questão + horário) para poder importar mais de uma vez
    const atuais = lerTentativas();
    const vistas = new Set(atuais.map((t) => `${t.questao_id}|${t.respondida_em}`));
    let novas = 0;
    for (const t of backup.tentativas) {
      const k = `${t.questao_id}|${t.respondida_em}`;
      if (vistas.has(k)) continue;
      vistas.add(k);
      atuais.push(t);
      novas++;
    }
    atuais.sort((a, b) => parseData(a.respondida_em) - parseData(b.respondida_em));
    gravar(CHAVES.tentativas, atuais);

    const redAtuais = lerRedacoes();
    const idsRed = new Set(redAtuais.map((r) => r.id));
    let novasRed = 0;
    for (const r of backup.redacoes || []) {
      if (idsRed.has(r.id)) continue;
      redAtuais.push(r);
      novasRed++;
    }
    gravar(CHAVES.redacoes, redAtuais);

    alert(`Backup importado: ${novas} respostas e ${novasRed} redações novas.`);
    abrirAjustes();
    atualizarAvisoRevisoes();
  } catch (e) {
    alert(`Não consegui ler esse arquivo: ${e.message}`);
  }
}

function zerarHistorico() {
  if (!confirm("Apagar TODAS as respostas e reiniciar a repetição espaçada? " +
               "Isso não dá para desfazer — exporte um backup antes.")) return;
  gravar(CHAVES.tentativas, []);
  abrirAjustes();
  atualizarAvisoRevisoes();
}

// ---------- eventos ----------
/* Numa conexão ruim o JSON demora e as abas já estão na tela: sem isso, tocar
   em Redação/Desempenho/Ajustes antes dos dados chegarem quebra o app. */
function seCarregado(fn) {
  return () => {
    if (!DADOS) {
      alert("Ainda estou carregando o banco de questões — só um instante.");
      return;
    }
    fn();
  };
}

$("f-disciplina").addEventListener("change", preencherAssuntos);
$("btn-iniciar").addEventListener("click", iniciarSessao);
$("btn-sessao-dia").addEventListener("click", iniciarSessaoDoDia);
$("btn-proxima").addEventListener("click", proxima);
$("btn-encerrar").addEventListener("click", encerrar);
$("btn-nova").addEventListener("click", () => {
  atualizarAvisoRevisoes();
  mostrar("tela-filtros");
});
$("nav-treino").addEventListener("click", seCarregado(() => {
  atualizarAvisoRevisoes();
  mostrar("tela-filtros");
}));
$("nav-redacao").addEventListener("click", seCarregado(carregarRedacao));
$("nav-stats").addEventListener("click", seCarregado(carregarStats));
$("nav-ajustes").addEventListener("click", seCarregado(abrirAjustes));

$("red-texto").addEventListener("input", atualizarContagem);
$("red-timer-btn").addEventListener("click", toggleTimer);
$("red-salvar").addEventListener("click", salvarRedacao);
$("red-apagar").addEventListener("click", apagarRedacao);
$("red-voltar").addEventListener("click", () => {
  $("red-view").classList.add("oculto");
  $("red-editor").classList.remove("oculto");
});
$("red-corrigir").addEventListener("click", corrigirRedacao);

$("btn-exportar").addEventListener("click", exportarBackup);
$("btn-importar").addEventListener("click", () => $("arquivo-importar").click());
$("arquivo-importar").addEventListener("change", (e) => {
  if (e.target.files[0]) importarBackup(e.target.files[0]);
  e.target.value = "";
});
$("btn-salvar-chave").addEventListener("click", () => {
  const v = $("cfg-chave").value.trim();
  if (!v) return alert("Cole a chave antes de salvar.");
  localStorage.setItem(CHAVES.apiKey, v);
  $("cfg-chave").value = "";
  $("cfg-status").textContent = "✅ Chave salva neste aparelho.";
});
$("btn-limpar-chave").addEventListener("click", () => {
  localStorage.removeItem(CHAVES.apiKey);
  $("cfg-status").textContent = "Chave removida.";
});
$("btn-zerar").addEventListener("click", zerarHistorico);

// evita perder uma redação em andamento ao fechar a aba sem querer
window.addEventListener("beforeunload", (e) => {
  if ($("red-texto").value.trim().length > 50 &&
      !$("tela-redacao").classList.contains("oculto")) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ---------- início ----------
carregarDados()
  .then(() => {
    montarFiltros();
    atualizarAvisoRevisoes();
    mostrar("tela-filtros");
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  })
  .catch((e) => {
    $("tela-carregando").innerHTML =
      `<p class="aviso">Não consegui carregar o banco de questões (${e.message}).<br>` +
      `Verifique a conexão e recarregue a página.</p>`;
  });
