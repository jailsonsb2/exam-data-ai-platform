"use strict";

/* Treino Concursos — versão estática.
   Sem backend: as questões vêm de dados/questoes.json e todo o histórico
   (tentativas, repetição espaçada e redações) vive no localStorage deste
   aparelho. A lógica abaixo é a mesma do app FastAPI, portada para o cliente. */

const $ = (id) => document.getElementById(id);

// intervalos da repetição espaçada (dias até rever, por acertos consecutivos)
const INTERVALOS_REVISAO = [1, 3, 7, 15];

/* Perfis: o site tem uma senha só (Basic Auth na Netlify), então quem entra
   escolhe/cria um perfil e o progresso de cada um fica separado neste
   aparelho. Não há sincronização entre aparelhos — o histórico do celular e o
   do PC são independentes, como sempre foram. */
const CHAVES_APP = {
  perfis: "tc.perfis",         // [{id, nome, criado_em}]
  atual: "tc.perfilAtual",     // id do perfil em uso
  seq: "tc.perfilSeq",         // contador de ids: apagar não libera o id
  semeadoPC: "tc.semeadoPC",   // o histórico do SQLite só entra em um perfil
};

// chaves da versão sem perfis: migradas para o primeiro perfil na abertura
const CHAVES_LEGADO = {
  tentativas: "tc.tentativas",
  redacoes: "tc.redacoes",
  apiKey: "tc.geminiKey",
  semeado: "tc.semeado",
};

let perfilAtual = null;         // {id, nome, criado_em}

/* Getters, não strings fixas: trocar de perfil troca o namespace inteiro sem
   precisar avisar nenhum dos ~30 pontos que leem e gravam. */
const CHAVES = {
  get tentativas() { return `tc.${perfilAtual.id}.tentativas`; },
  get redacoes() { return `tc.${perfilAtual.id}.redacoes`; },
  get apiKey() { return `tc.${perfilAtual.id}.geminiKey`; },
  get semeado() { return `tc.${perfilAtual.id}.semeado`; },
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

// ---------- perfis ----------
const lerPerfis = () => ler(CHAVES_APP.perfis, []);

/* Contador próprio em vez de "maior id + 1": apagar um perfil não pode
   liberar o id dele, senão o perfil seguinte herdaria qualquer chave
   `tc.<id>.*` que tenha sobrado de uma limpeza incompleta. */
function proximoIdPerfil(perfis) {
  const usados = perfis.map((p) => Number(String(p.id).replace(/\D/g, "")) || 0);
  const seq = Math.max(ler(CHAVES_APP.seq, 0), ...usados, 0) + 1;
  gravar(CHAVES_APP.seq, seq);
  return `p${seq}`;
}

function criarPerfil(nome, perfis = lerPerfis()) {
  const perfil = {
    id: proximoIdPerfil(perfis),
    nome: nome.trim().slice(0, 40),
    criado_em: new Date().toISOString(),
  };
  perfis.push(perfil);
  gravar(CHAVES_APP.perfis, perfis);
  return perfil;
}

/** Move as chaves da versão sem perfis para o namespace do perfil novo. */
function migrarLegado(perfil) {
  let achou = false;
  for (const [campo, antiga] of Object.entries(CHAVES_LEGADO)) {
    const bruto = localStorage.getItem(antiga);
    if (bruto === null) continue;
    localStorage.setItem(`tc.${perfil.id}.${campo === "apiKey" ? "geminiKey" : campo}`,
                         bruto);
    localStorage.removeItem(antiga);
    achou = true;
  }
  // o histórico do PC já foi semeado antes dos perfis existirem
  if (achou) gravar(CHAVES_APP.semeadoPC, true);
  return achou;
}

/** Deixa sempre um perfil ativo — o app nunca roda sem namespace definido. */
function garantirPerfil() {
  let perfis = lerPerfis();
  if (!perfis.length) {
    const perfil = criarPerfil("Meu progresso", perfis);
    migrarLegado(perfil);
    perfis = lerPerfis();
  }
  const id = ler(CHAVES_APP.atual, null);
  perfilAtual = perfis.find((p) => p.id === id) || perfis[0];
  gravar(CHAVES_APP.atual, perfilAtual.id);
}

function usarPerfil(id) {
  const perfil = lerPerfis().find((p) => p.id === id);
  if (!perfil) return;
  perfilAtual = perfil;
  gravar(CHAVES_APP.atual, perfil.id);
  // a sessão em andamento é do perfil anterior: começa de novo
  estado.fila = [];
  estado.indice = 0;
  estado.acertos = 0;
  estado.respondidas = 0;
  pintarPerfil();
  atualizarAvisoRevisoes();
  mostrar("tela-filtros");
}

function apagarPerfil(id) {
  const perfis = lerPerfis();
  if (perfis.length < 2) {
    alert("Este é o único perfil — crie outro antes de apagar este.");
    return;
  }
  const perfil = perfis.find((p) => p.id === id);
  const n = ler(`tc.${id}.tentativas`, []).length;
  if (!confirm(`Apagar o perfil "${perfil.nome}" e as ${n} respostas dele? ` +
               "Isso não dá para desfazer.")) return;
  for (const campo of ["tentativas", "redacoes", "geminiKey", "semeado"]) {
    localStorage.removeItem(`tc.${id}.${campo}`);
  }
  gravar(CHAVES_APP.perfis, perfis.filter((p) => p.id !== id));
  if (perfilAtual.id === id) {
    perfilAtual = lerPerfis()[0];
    gravar(CHAVES_APP.atual, perfilAtual.id);
    estado.fila = [];
  }
  pintarPerfil();
  abrirPerfis();
}

function renomearPerfil(id) {
  const perfis = lerPerfis();
  const perfil = perfis.find((p) => p.id === id);
  const nome = prompt("Novo nome do perfil:", perfil.nome);
  if (!nome || !nome.trim()) return;
  perfil.nome = nome.trim().slice(0, 40);
  gravar(CHAVES_APP.perfis, perfis);
  if (perfilAtual.id === id) perfilAtual = perfil;
  pintarPerfil();
  abrirPerfis();
}

function pintarPerfil() {
  $("perfil-chip").textContent = `👤 ${perfilAtual.nome}`;
}

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

  /* Primeira abertura: traz o histórico que já existia no PC. O controle é
     global (não por perfil) porque esse histórico é de uma pessoa só — um
     perfil novo começa zerado, e não herdando as respostas do dono do PC. */
  if (!ler(CHAVES_APP.semeadoPC, false)) {
    const iniciais = (DADOS.tentativas_iniciais || []).map((t) => ({
      questao_id: t.questao_id,
      resposta: t.resposta,
      correta: t.correta,
      respondida_em: parseData(t.respondida_em).toISOString(),
    }));
    if (iniciais.length && !lerTentativas().length) {
      gravar(CHAVES.tentativas, iniciais);
    }
    gravar(CHAVES_APP.semeadoPC, true);
  }
}

// ---------- navegação entre telas ----------
const TELAS = ["tela-carregando", "tela-filtros", "tela-questao", "tela-fim",
               "tela-stats", "tela-redacao", "tela-ajustes", "tela-perfis"];

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
  /* Só banca, ano e órgão: o cargo levava o rótulo a 97 caracteres, que num
     seletor nativo de celular fica cortado sem acrescentar nada — o órgão já
     identifica cada uma das nove provas sem ambiguidade. */
  for (const p of DADOS.provas) {
    $("f-prova").add(new Option(`${p.banca} ${p.ano} · ${p.orgao}`, p.id));
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
     as alternativas que têm texto — desenhar uma vazia entregaria o gabarito.
     Nas provas certo/errado (Cebraspe) são sempre as duas letras C e E, que já
     vêm preenchidas: o caderno não imprime as alternativas. */
  const alts = q.alts || {};
  const TODAS = ["A", "B", "C", "D", "E"];
  const letras =
    prova.formato === "ce"
      ? ["C", "E"]
      : temImagens
        ? TODAS
        : TODAS.filter((l) => alts[l]);

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

// ---------- tela de perfis ----------
function abrirPerfis() {
  const lista = $("perfis-lista");
  lista.innerHTML = "";
  for (const p of lerPerfis()) {
    const n = ler(`tc.${p.id}.tentativas`, []).length;
    const nr = ler(`tc.${p.id}.redacoes`, []).length;
    const atual = p.id === perfilAtual.id;

    const linha = document.createElement("div");
    linha.className = "perfil" + (atual ? " atual" : "");

    const info = document.createElement("div");
    info.className = "perfil-info";
    const nome = document.createElement("strong");
    nome.textContent = p.nome + (atual ? " (em uso)" : "");
    const resumo = document.createElement("span");
    resumo.className = "dica";
    resumo.textContent = `${n} resposta${n === 1 ? "" : "s"} · ` +
                         `${nr} redaç${nr === 1 ? "ão" : "ões"}`;
    info.append(nome, resumo);

    const acoes = document.createElement("div");
    acoes.className = "perfil-acoes";
    if (!atual) {
      const usar = document.createElement("button");
      usar.className = "primario";
      usar.textContent = "Usar";
      usar.addEventListener("click", () => usarPerfil(p.id));
      acoes.append(usar);
    }
    const ren = document.createElement("button");
    ren.textContent = "Renomear";
    ren.addEventListener("click", () => renomearPerfil(p.id));
    const del = document.createElement("button");
    del.textContent = "Apagar";
    del.addEventListener("click", () => apagarPerfil(p.id));
    acoes.append(ren, del);

    linha.append(info, acoes);
    lista.append(linha);
  }
  $("perfil-novo-nome").value = "";
  mostrar("tela-perfis");
}

function criarPerfilPelaTela() {
  const nome = $("perfil-novo-nome").value.trim();
  if (!nome) {
    alert("Escreva um nome para o perfil.");
    return;
  }
  if (lerPerfis().some((p) => p.nome.toLowerCase() === nome.toLowerCase())) {
    alert("Já existe um perfil com esse nome.");
    return;
  }
  const perfil = criarPerfil(nome);
  usarPerfil(perfil.id);
}

// ---------- ajustes ----------
function abrirAjustes() {
  const tentativas = lerTentativas();
  const redacoes = lerRedacoes();
  $("backup-resumo").textContent =
    `Perfil "${perfilAtual.nome}": ${tentativas.length} respostas e ` +
    `${redacoes.length} redações guardadas neste aparelho.`;
  $("cfg-status").textContent = localStorage.getItem(CHAVES.apiKey)
    ? `✅ Chave salva para o perfil "${perfilAtual.nome}".`
    : "Nenhuma chave configurada.";
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
    perfil: perfilAtual.nome,      // o backup é sempre do perfil em uso
    exportado_em: new Date().toISOString(),
    tentativas: lerTentativas(),
    redacoes: lerRedacoes(),
  };
  const blob = new Blob([JSON.stringify(backup, null, 1)],
                        { type: "application/json" });
  const a = document.createElement("a");
  const hoje = new Date().toISOString().slice(0, 10);
  const apelido = perfilAtual.nome.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // tira os acentos
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "perfil";
  a.href = URL.createObjectURL(blob);
  a.download = `treino-concursos-${apelido}-${hoje}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importarBackup(arquivo) {
  try {
    const backup = JSON.parse(await arquivo.text());
    if (!Array.isArray(backup.tentativas)) throw new Error("formato inesperado");

    // o backup entra no perfil aberto: avisa quando é de outra pessoa, senão
    // o histórico dos dois vira um só sem ninguém perceber
    if (backup.perfil && backup.perfil !== perfilAtual.nome &&
        !confirm(`Este backup é do perfil "${backup.perfil}" e você está em ` +
                 `"${perfilAtual.nome}". Misturar os dois históricos?`)) return;

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
$("perfil-chip").addEventListener("click", seCarregado(abrirPerfis));
$("btn-perfis").addEventListener("click", seCarregado(abrirPerfis));
$("perfil-criar").addEventListener("click", criarPerfilPelaTela);
$("perfil-voltar").addEventListener("click", () => mostrar("tela-filtros"));

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
// antes de qualquer leitura: sem perfil ativo não existe namespace de dados
garantirPerfil();
pintarPerfil();

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
