"use strict";

const $ = (id) => document.getElementById(id);

const estado = {
  fila: [],        // questões da sessão atual
  indice: 0,
  acertos: 0,
  respondidas: 0,
};

// ---------- navegação entre telas ----------
const TELAS = ["tela-filtros", "tela-questao", "tela-fim", "tela-stats", "tela-redacao"];
function mostrar(tela) {
  TELAS.forEach((t) => $(t).classList.toggle("oculto", t !== tela));
  $("nav-treino").classList.toggle("active",
    !["tela-stats", "tela-redacao"].includes(tela));
  $("nav-redacao").classList.toggle("active", tela === "tela-redacao");
  $("nav-stats").classList.toggle("active", tela === "tela-stats");
}

// ---------- filtros ----------
let dadosFiltros = null;

async function carregarFiltros() {
  fetch("/api/revisoes-pendentes")
    .then((r) => r.json())
    .then((d) => {
      if (d.pendentes > 0) {
        $("sd-info").textContent =
          `${d.pendentes} questão(ões) esperando revisão espaçada ` +
          `(1, 3, 7 e 15 dias) + questões novas para completar.`;
      }
    })
    .catch(() => {});

  const r = await fetch("/api/filtros");
  dadosFiltros = await r.json();

  for (const p of dadosFiltros.provas) {
    const o = new Option(`${p.banca} ${p.ano} - ${p.orgao} (${p.cargo})`, p.id);
    $("f-prova").add(o);
  }
  for (const d of dadosFiltros.disciplinas) {
    $("f-disciplina").add(new Option(`${d.disciplina} (${d.n})`, d.disciplina));
  }
  preencherAssuntos();
}

function preencherAssuntos() {
  const disc = $("f-disciplina").value;
  const sel = $("f-assunto");
  sel.length = 1; // mantém "Todos"
  for (const a of dadosFiltros.assuntos) {
    if (!disc || a.disciplina === disc) {
      sel.add(new Option(`${a.assunto} (${a.n})`, a.assunto));
    }
  }
}

// ---------- sessão de treino ----------
async function iniciarSessao() {
  const params = new URLSearchParams();
  if ($("f-prova").value) params.set("prova_id", $("f-prova").value);
  if ($("f-disciplina").value) params.set("disciplina", $("f-disciplina").value);
  if ($("f-assunto").value) params.set("assunto", $("f-assunto").value);
  params.set("modo", $("f-modo").value);
  params.set("limit", $("f-limit").value);

  const r = await fetch(`/api/questoes?${params}`);
  const data = await r.json();
  if (!data.total) {
    $("filtros-vazio").classList.remove("oculto");
    return;
  }
  $("filtros-vazio").classList.add("oculto");
  Object.assign(estado, { fila: data.questoes, indice: 0, acertos: 0, respondidas: 0 });
  mostrar("tela-questao");
  renderQuestao();
}

async function iniciarSessaoDoDia() {
  const params = new URLSearchParams();
  if ($("f-prova").value) params.set("prova_id", $("f-prova").value);
  if ($("f-disciplina").value) params.set("disciplina", $("f-disciplina").value);
  if ($("f-assunto").value) params.set("assunto", $("f-assunto").value);
  params.set("limit", $("f-limit").value);

  const r = await fetch(`/api/sessao-do-dia?${params}`);
  const data = await r.json();
  if (!data.total) {
    $("filtros-vazio").textContent =
      "Nada para hoje com esses filtros — nem revisões devidas, nem questões novas.";
    $("filtros-vazio").classList.remove("oculto");
    return;
  }
  $("filtros-vazio").classList.add("oculto");
  Object.assign(estado, { fila: data.questoes, indice: 0, acertos: 0, respondidas: 0 });
  mostrar("tela-questao");
  renderQuestao();
}

function renderQuestao() {
  const q = estado.fila[estado.indice];
  $("q-progresso").textContent =
    `Questão ${estado.indice + 1} de ${estado.fila.length}` +
    (estado.respondidas ? ` · ${estado.acertos}/${estado.respondidas} acertos na sessão` : "");
  $("q-meta").textContent =
    `${q.banca} ${q.ano} · ${q.orgao} · Q${q.numero} · ${q.assunto || q.disciplina}` +
    (q.origem === "revisao" ? " · 🔁 revisão" : "");

  const temImagens = q.imagens && q.imagens.length > 0;

  // sem imagem renderizada, resta avisar para conferir o PDF
  $("q-revisar").classList.toggle("oculto", !q.revisar || temImagens);
  if (q.revisar && !temImagens) {
    $("q-revisar").textContent =
      `⚠️ Esta questão tem fórmula, código ou tabela que só aparece no PDF ` +
      `(${q.pdf}, página ${q.pagina}) — confira o enunciado original antes de responder.`;
  }

  // questões com conteúdo visual usam o recorte do PDF como enunciado
  const contImg = $("q-imagens");
  contImg.innerHTML = "";
  if (temImagens) {
    for (const src of q.imagens) {
      const img = document.createElement("img");
      img.src = `/static/${src}`;
      img.alt = `Questão ${q.numero} (recorte do PDF)`;
      contImg.append(img);
    }
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

  const cont = $("q-alternativas");
  cont.innerHTML = "";
  // provas certo/errado (Cebraspe) só têm as letras C e E
  const letras = q.formato === "ce" ? ["C", "E"] : ["A", "B", "C", "D", "E"];
  for (const letra of letras) {
    const btn = document.createElement("button");
    btn.className = "alternativa";
    btn.dataset.letra = letra;
    btn.innerHTML = `<span class="letra">(${letra})</span>`;
    btn.append(q[`alt_${letra.toLowerCase()}`] || "");
    btn.addEventListener("click", () => responder(q, letra));
    cont.append(btn);
  }
  $("q-feedback").classList.add("oculto");
  $("q-justificativa").classList.add("oculto");
  $("btn-proxima").classList.add("oculto");
}

async function responder(q, letra) {
  document.querySelectorAll(".alternativa").forEach((b) => (b.disabled = true));
  const r = await fetch("/api/responder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questao_id: q.id, resposta: letra }),
  });
  const data = await r.json();

  estado.respondidas++;
  if (data.correta) estado.acertos++;

  document.querySelectorAll(".alternativa").forEach((b) => {
    if (b.dataset.letra === data.gabarito) b.classList.add("certa");
    else if (b.dataset.letra === letra) b.classList.add("errada");
  });

  const fb = $("q-feedback");
  fb.classList.remove("oculto", "ok", "erro");
  fb.classList.add(data.correta ? "ok" : "erro");
  fb.textContent = data.correta
    ? "✅ Acertou!"
    : `❌ Errou — gabarito: (${data.gabarito})`;

  const just = $("q-justificativa");
  if (data.justificativa) {
    just.classList.remove("oculto");
    just.textContent = data.justificativa;
  } else {
    just.classList.add("oculto");
  }

  $("btn-proxima").classList.remove("oculto");
  $("q-progresso").textContent =
    `Questão ${estado.indice + 1} de ${estado.fila.length}` +
    ` · ${estado.acertos}/${estado.respondidas} acertos na sessão`;
}

function proxima() {
  if (estado.indice + 1 >= estado.fila.length) return encerrar();
  estado.indice++;
  renderQuestao();
  window.scrollTo({ top: 0 });
}

function encerrar() {
  const { acertos, respondidas } = estado;
  const pct = respondidas ? Math.round((100 * acertos) / respondidas) : 0;
  $("fim-resumo").textContent = respondidas
    ? `Você respondeu ${respondidas} questões e acertou ${acertos} (${pct}%).`
    : "Nenhuma questão respondida nesta sessão.";
  mostrar("tela-fim");
}

// ---------- desempenho ----------
async function carregarStats() {
  const r = await fetch("/api/stats");
  const data = await r.json();
  const g = data.geral;
  const pctG = g.tentativas ? Math.round((100 * g.acertos) / g.tentativas) : 0;
  $("stats-geral").textContent = g.tentativas
    ? `${g.tentativas} tentativas · ${g.questoes_distintas} questões distintas · ${pctG}% de acerto geral`
    : "Nenhuma tentativa registrada ainda — faça uma sessão de treino primeiro.";

  const tbody = $("stats-tabela").querySelector("tbody");
  tbody.innerHTML = "";
  for (const a of data.por_assunto) {
    const pct = Math.round((100 * a.acertos) / a.tentativas);
    const cls = pct < 60 ? "pct-baixa" : pct < 80 ? "pct-media" : "pct-alta";
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${a.assunto}</td><td>${a.tentativas}</td>` +
      `<td>${a.acertos}</td><td class="${cls}">${pct}%</td>`;
    tbody.append(tr);
  }
  mostrar("tela-stats");
}

// ---------- redação ----------
const red = { temas: [], timerId: null, restante: 60 * 60 };

async function carregarRedacao() {
  if (!red.temas.length) {
    const r = await fetch("/api/redacao/temas");
    red.temas = (await r.json()).temas;
    for (const t of red.temas) {
      $("red-tema").add(new Option(t.titulo, t.id));
    }
    $("red-tema").addEventListener("change", mostrarComando);
    mostrarComando();
  }
  await listarRedacoes();
  $("red-editor").classList.remove("oculto");
  $("red-view").classList.add("oculto");
  mostrar("tela-redacao");
}

function mostrarComando() {
  const t = red.temas.find((x) => x.id == $("red-tema").value);
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
  }
}

function toggleTimer() {
  if (red.timerId) {
    clearInterval(red.timerId);
    red.timerId = null;
    $("red-timer-btn").textContent = "▶ Retomar";
  } else {
    red.timerId = setInterval(tickTimer, 1000);
    $("red-timer-btn").textContent = "⏸ Pausar";
  }
}

async function salvarRedacao() {
  const t = red.temas.find((x) => x.id == $("red-tema").value);
  const resp = await fetch("/api/redacoes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tema: t ? t.comando : "Tema livre",
                           texto: $("red-texto").value }),
  });
  if (!resp.ok) {
    const erro = await resp.json();
    alert(erro.detail || "erro ao salvar");
    return;
  }
  $("red-texto").value = "";
  atualizarContagem();
  if (red.timerId) toggleTimer();
  red.restante = 60 * 60;
  $("red-timer").textContent = "60:00";
  $("red-timer-btn").textContent = "▶ Cronômetro (60 min)";
  await listarRedacoes();
  alert("Redação salva! Clique nela na lista para ver ou corrigir com IA.");
}

async function listarRedacoes() {
  const r = await fetch("/api/redacoes");
  const data = await r.json();
  const tbody = $("red-tabela").querySelector("tbody");
  tbody.innerHTML = "";
  for (const x of data.redacoes) {
    const tr = document.createElement("tr");
    tr.className = "red-linha";
    const nota = x.nota != null ? x.nota.toFixed(1)
      : (x.corrigida ? "—" : "sem correção");
    tr.innerHTML =
      `<td>${x.criada_em.slice(0, 16)}</td>` +
      `<td>${x.tema.slice(0, 60)}...</td>` +
      `<td>${x.palavras}</td><td>${nota}</td>`;
    tr.addEventListener("click", () => abrirRedacao(x.id));
    tbody.append(tr);
  }
}

async function abrirRedacao(id) {
  const r = await fetch(`/api/redacoes/${id}`);
  const x = await r.json();
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
}

async function corrigirRedacao() {
  const btn = $("red-corrigir");
  btn.disabled = true;
  btn.textContent = "Corrigindo... (pode levar ~1 min)";
  try {
    const r = await fetch(`/api/redacoes/${red.aberta}/corrigir`,
                          { method: "POST" });
    const data = await r.json();
    if (!r.ok) {
      alert(data.detail || "erro na correção");
      return;
    }
    $("red-view-correcao").textContent = data.correcao;
    $("red-view-correcao").classList.remove("oculto");
    await listarRedacoes();
  } finally {
    btn.disabled = false;
    btn.textContent = "Corrigir de novo com IA";
  }
}

// ---------- eventos ----------
$("f-disciplina").addEventListener("change", preencherAssuntos);
$("btn-iniciar").addEventListener("click", iniciarSessao);
$("btn-sessao-dia").addEventListener("click", iniciarSessaoDoDia);
$("btn-proxima").addEventListener("click", proxima);
$("btn-encerrar").addEventListener("click", encerrar);
$("btn-nova").addEventListener("click", () => mostrar("tela-filtros"));
$("nav-treino").addEventListener("click", () => mostrar("tela-filtros"));
$("nav-redacao").addEventListener("click", carregarRedacao);
$("nav-stats").addEventListener("click", carregarStats);
$("red-texto").addEventListener("input", atualizarContagem);
$("red-timer-btn").addEventListener("click", toggleTimer);
$("red-salvar").addEventListener("click", salvarRedacao);
$("red-voltar").addEventListener("click", () => {
  $("red-view").classList.add("oculto");
  $("red-editor").classList.remove("oculto");
});
$("red-corrigir").addEventListener("click", corrigirRedacao);

carregarFiltros();
