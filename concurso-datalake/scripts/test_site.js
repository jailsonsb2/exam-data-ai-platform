/* Testes do site estático: roda o site/app.js real dentro de um DOM falso,
   para validar a lógica portada do backend Python (repetição espaçada,
   filtros, correção, estatísticas) e a integridade dos dados exportados.

   Uso, depois de gerar o site:
       python scripts/build_site.py
       node scripts/test_site.js
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SITE = path.join(__dirname, "..", "site");

// ---------- DOM falso ----------
function novoEl(id) {
  const el = {
    id, _filhos: [], _classes: new Set(), textContent: "", value: "",
    length: 1, options: [], dataset: {}, disabled: false, open: false,
    style: {}, files: [],
    classList: {
      toggle(c, f) { if (f === undefined) f = !el._classes.has(c);
                     f ? el._classes.add(c) : el._classes.delete(c); return f; },
      add(...cs) { cs.forEach((c) => el._classes.add(c)); },
      remove(...cs) { cs.forEach((c) => el._classes.delete(c)); },
      contains(c) { return el._classes.has(c); },
    },
    set innerHTML(v) { if (v === "") el._filhos = []; el._html = v; },
    get innerHTML() { return el._html || ""; },
    append(...xs) { xs.forEach((x) => el._filhos.push(x)); },
    add(opt) { el.options.push(opt); el.length = el.options.length + 1; },
    addEventListener(ev, fn) { (el._ev ||= {})[ev] = fn; },
    querySelector() { return novoEl("tbody"); },
    click() {},
  };
  return el;
}

const elementos = new Map();
const document = {
  getElementById(id) {
    if (!elementos.has(id)) elementos.set(id, novoEl(id));
    return elementos.get(id);
  },
  createElement(tag) { return novoEl(tag); },
  querySelectorAll(sel) {
    if (sel === ".alternativa") return document.getElementById("q-alternativas")._filhos;
    return [];
  },
  addEventListener() {},
};

const armazem = new Map();
const localStorage = {
  getItem: (k) => (armazem.has(k) ? armazem.get(k) : null),
  setItem: (k, v) => armazem.set(k, String(v)),
  removeItem: (k) => armazem.delete(k),
};

const dados = fs.readFileSync(path.join(SITE, "dados/questoes.json"), "utf-8");
const ctx = {
  document, localStorage, console,
  Option: function (t, v) { return { text: t, value: v }; },
  navigator: { onLine: true },
  window: { scrollTo() {}, addEventListener() {} },
  alert: (m) => console.log("   [alert]", m),
  confirm: () => true,
  prompt: (_m, padrao) => padrao,
  fetch: async (u) => ({ ok: true, status: 200, json: async () => JSON.parse(dados) }),
  setInterval: () => 0, clearInterval: () => {},
  Blob: function () {}, URL: { createObjectURL: () => "", revokeObjectURL() {} },
  Date, Math, JSON, Set, Map, Number, String, Array, Object, isNaN, parseFloat,
  encodeURIComponent, Error, Promise,
};
ctx.globalThis = ctx;
vm.createContext(ctx);

const codigo = fs.readFileSync(path.join(SITE, "app.js"), "utf-8");
vm.runInContext(codigo, ctx);

// cada trecho roda no seu proprio bloco, senao `const` colide entre chamadas
const rodar = (expr) => vm.runInContext(`{ ${expr} }`, ctx);
let falhas = 0;
function ok(nome, cond, extra = "") {
  console.log(`${cond ? "  OK  " : "FALHA "} ${nome}${extra ? " -> " + extra : ""}`);
  if (!cond) falhas++;
}

setTimeout(() => {
  console.log("\n=== carregamento ===");
  const nq = rodar("DADOS.questoes.length");
  ok("questoes carregadas", nq > 600, `${nq}`);
  ok("mapa de questoes", rodar("QUESTOES.size") === nq);
  ok("provas carregadas",
     rodar("PROVAS.size") === rodar("DADOS.provas.length"),
     `${rodar("PROVAS.size")}`);
  ok("tentativas semeadas do SQLite", rodar("lerTentativas().length") === 10,
     `${rodar("lerTentativas().length")}`);
  ok("filtros de disciplina montados",
     rodar("document.getElementById('f-disciplina').options.length") > 0);

  console.log("\n=== sessao manual ===");
  rodar("document.getElementById('f-limit').value = '20'");
  rodar("document.getElementById('f-modo').value = 'todas'");
  rodar("iniciarSessao()");
  ok("fila com 20 questoes", rodar("estado.fila.length") === 20,
     `${rodar("estado.fila.length")}`);
  ok("questao renderizada tem alternativas",
     rodar("document.getElementById('q-alternativas')._filhos.length") >= 4);

  console.log("\n=== responder (certo e errado) ===");
  const antes = rodar("lerTentativas().length");
  rodar(`
    const q0 = estado.fila[0];
    responder(q0, q0.gabarito);                       // acerto
    proxima();
    const q1 = estado.fila[1];
    const errada = ['A','B','C','D','E'].find(l => l !== q1.gabarito && q1.alts[l]);
    responder(q1, errada);                            // erro
    globalThis._q0 = q0.id; globalThis._q1 = q1.id;
  `);
  ok("2 tentativas gravadas", rodar("lerTentativas().length") === antes + 2);
  ok("acerto contabilizado", rodar("estado.acertos") === 1, `${rodar("estado.acertos")}`);
  ok("respondidas contabilizadas", rodar("estado.respondidas") === 2);
  ok("acerto marcado como correta=1",
     rodar("lerTentativas().find(t => t.questao_id === _q0 && t.correta === 1) !== undefined"));
  ok("erro marcado como correta=0",
     rodar("lerTentativas().find(t => t.questao_id === _q1 && t.correta === 0) !== undefined"));

  console.log("\n=== repeticao espacada ===");
  ok("acabou de errar: ainda nao e devida (intervalo 1 dia)",
     rodar("revisoesDevidas().some(d => d.qid === _q1)") === false);
  ok("acerto de primeira nunca entra no ciclo",
     rodar("revisoesDevidas().some(d => d.qid === _q0)") === false);

  // envelhece o erro em 2 dias -> deve vencer o intervalo de 1 dia
  rodar(`
    const ts = lerTentativas();
    const t = ts.find(x => x.questao_id === _q1 && x.correta === 0);
    t.respondida_em = new Date(Date.now() - 2*86400000).toISOString();
    gravar(CHAVES.tentativas, ts);
  `);
  ok("apos 2 dias, o erro vira revisao devida",
     rodar("revisoesDevidas().some(d => d.qid === _q1)"));

  // acerta a revisao -> proximo intervalo passa a ser 3 dias
  rodar(`
    const ts = lerTentativas();
    ts.push({questao_id:_q1, resposta:'X', correta:1,
             respondida_em:new Date(Date.now() - 2*86400000).toISOString()});
    gravar(CHAVES.tentativas, ts);
  `);
  ok("acertou a revisao: 2 dias nao bastam para o intervalo de 3",
     rodar("revisoesDevidas().some(d => d.qid === _q1)") === false);

  // graduacao: 4 acertos consecutivos apos o erro
  rodar(`
    const ts = lerTentativas();
    for (let i = 0; i < 3; i++) {
      ts.push({questao_id:_q1, resposta:'X', correta:1,
               respondida_em:new Date(Date.now() - 60*86400000).toISOString()});
    }
    gravar(CHAVES.tentativas, ts);
  `);
  ok("apos 4 acertos seguidos a questao gradua e sai do ciclo",
     rodar("revisoesDevidas().some(d => d.qid === _q1)") === false);

  console.log("\n=== sessao do dia ===");
  rodar(`
    // deixa 3 questoes erradas e vencidas
    const ts = lerTentativas();
    globalThis._devidas = DADOS.questoes.slice(100, 103).map(q => q.id);
    for (const id of _devidas) {
      ts.push({questao_id:id, resposta:'X', correta:0,
               respondida_em:new Date(Date.now() - 5*86400000).toISOString()});
    }
    gravar(CHAVES.tentativas, ts);
  `);
  ok("3 revisoes devidas detectadas",
     rodar("_devidas.every(id => revisoesDevidas().some(d => d.qid === id))"));
  // o historico semeado do SQLite tambem tem erros vencidos, entao o total de
  // revisoes devidas nao e exatamente 3
  const totalDevidas = rodar("revisoesDevidas().length");
  rodar("document.getElementById('f-limit').value = '10'; iniciarSessaoDoDia()");
  ok("sessao do dia montou 10 questoes", rodar("estado.fila.length") === 10,
     `${rodar("estado.fila.length")}`);
  ok("todas as revisoes devidas entraram na sessao",
     rodar("estado.fila.filter(q => q.origem === 'revisao').length") === totalDevidas,
     `${rodar("estado.fila.filter(q => q.origem === 'revisao').length")} de ${totalDevidas}`);
  ok("o resto foi completado com questoes novas",
     rodar("estado.fila.filter(q => q.origem === 'nova').length") === 10 - totalDevidas);
  ok("nenhuma questao repetida na fila",
     rodar("new Set(estado.fila.map(q => q.id)).size") === 10);

  console.log("\n=== modos de filtro ===");
  ok("modo 'erradas' so traz erros na ultima tentativa",
     rodar(`filtrar({modo:'erradas'}).every(q => {
       const ts = lerTentativas().filter(t => t.questao_id === q.id);
       return ts.length && !ts[ts.length-1].correta; })`));
  ok("modo 'nao_respondidas' exclui as ja respondidas",
     rodar(`filtrar({modo:'nao_respondidas'}).every(q =>
       !lerTentativas().some(t => t.questao_id === q.id))`));
  ok("filtro por prova funciona",
     rodar("filtrar({provaId: DADOS.provas[0].id}).every(q => q.prova_id === DADOS.provas[0].id)"));
  ok("filtro por disciplina funciona",
     rodar(`filtrar({disciplina: DADOS.questoes[0].disciplina})
              .every(q => q.disciplina === DADOS.questoes[0].disciplina)`));

  console.log("\n=== estatisticas ===");
  rodar("carregarStats()");
  const geral = rodar("document.getElementById('stats-geral').textContent");
  ok("stats calculadas", geral.includes("tentativas"), geral);

  console.log("\n=== backup ===");
  rodar(`
    globalThis._backup = {tentativas: lerTentativas(), redacoes: []};
    globalThis._antesImport = lerTentativas().length;
  `);
  rodar(`
    // reimportar o mesmo backup nao pode duplicar nada
    const atuais = lerTentativas();
    const vistas = new Set(atuais.map(t => t.questao_id + '|' + t.respondida_em));
    let novas = 0;
    for (const t of _backup.tentativas) {
      const k = t.questao_id + '|' + t.respondida_em;
      if (!vistas.has(k)) { vistas.add(k); atuais.push(t); novas++; }
    }
    globalThis._novas = novas;
  `);
  ok("importar o mesmo backup nao duplica", rodar("_novas") === 0, `${rodar("_novas")} novas`);

  console.log("\n=== integridade dos dados ===");
  ok("toda questao tem gabarito",
     rodar("DADOS.questoes.every(q => ['A','B','C','D','E'].includes(q.gabarito))"));
  // o gabarito precisa ser clicavel: ou tem texto, ou a questao tem recorte do
  // PDF (nesse caso o app desenha as cinco letras para escolher lendo a imagem)
  ok("o gabarito e sempre clicavel",
     rodar("DADOS.questoes.every(q => q.alts[q.gabarito] || (q.imagens||[]).length)"),
     `${rodar("DADOS.questoes.filter(q => !q.alts[q.gabarito] && !(q.imagens||[]).length).length")} sem`);

  console.log("\n=== render das alternativas ===");
  rodar(`
    const comImg = DADOS.questoes.find(q => (q.imagens||[]).length && !q.alts[q.gabarito]);
    estado.fila = [comImg]; estado.indice = 0; renderQuestao();
    globalThis._botoes = document.getElementById('q-alternativas')._filhos;
  `);
  ok("questao com alternativas so no recorte desenha as 5 letras",
     rodar("_botoes.length") === 5, `${rodar("_botoes.length")} botoes`);
  ok("o gabarito esta entre os botoes desenhados",
     rodar("_botoes.some(b => b.dataset.letra === estado.fila[0].gabarito)"));

  rodar(`
    const semImg = DADOS.questoes.find(q => !(q.imagens||[]).length &&
                                            Object.keys(q.alts).length === 5);
    estado.fila = [semImg]; estado.indice = 0; renderQuestao();
    globalThis._botoes2 = document.getElementById('q-alternativas')._filhos;
  `);
  ok("questao normal desenha as alternativas com texto",
     rodar("_botoes2.length") === 5 &&
     rodar("_botoes2.every(b => !b.classList.contains('so-letra'))"));
  // provas certo/errado (Cebraspe): duas alternativas, mesmo com recorte do PDF
  rodar(`
    const provaCE = [...PROVAS.values()].find(p => p.formato === "ce");
    const ce = provaCE
      ? DADOS.questoes.filter(q => q.prova_id === provaCE.id)
      : [];
    globalThis._ce = ce.length;
    if (ce.length) {
      estado.fila = [ce.find(q => (q.imagens||[]).length) || ce[0]];
      estado.indice = 0; renderQuestao();
      globalThis._botoesCE = document.getElementById('q-alternativas')._filhos;
    }
  `);
  if (rodar("_ce")) {
    ok("prova certo/errado desenha so as letras C e E",
       rodar("_botoesCE.map(b => b.dataset.letra).join('')") === "CE",
       rodar("_botoesCE.map(b => b.dataset.letra).join(',')"));
    ok("as alternativas certo/errado vem com texto",
       rodar("_botoesCE.every(b => !b.classList.contains('so-letra'))"));
    ok("o gabarito das questoes certo/errado e sempre C ou E",
       rodar(`DADOS.questoes.filter(q => PROVAS.get(q.prova_id).formato === "ce")
                            .every(q => q.gabarito === "C" || q.gabarito === "E")`));
  }

  ok("toda questao tem enunciado ou imagem",
     rodar("DADOS.questoes.every(q => (q.enunciado && q.enunciado.trim()) || (q.imagens||[]).length)"));
  ok("toda questao aponta para uma prova valida",
     rodar("DADOS.questoes.every(q => PROVAS.has(q.prova_id))"));

  // por último: mexer em perfil troca o namespace e zeraria os testes acima
  console.log("\n=== perfis ===");
  ok("abre com um perfil ativo",
     rodar("lerPerfis().length") === 1 && !!rodar("perfilAtual.nome"),
     rodar("perfilAtual.nome"));
  ok("as chaves de dados seguem o perfil",
     rodar("CHAVES.tentativas") === `tc.${rodar("perfilAtual.id")}.tentativas`,
     rodar("CHAVES.tentativas"));

  rodar(`
    globalThis._p1 = perfilAtual.id;
    globalThis._n1 = lerTentativas().length;
    globalThis._novo = criarPerfil("Fulano");
    usarPerfil(_novo.id);
  `);
  ok("perfil novo comeca sem historico",
     rodar("lerTentativas().length") === 0,
     `${rodar("lerTentativas().length")} respostas`);
  ok("perfil novo nao herda o historico semeado do PC",
     rodar("lerTentativas().length") === 0 && rodar("_n1") > 0);

  rodar(`
    gravar(CHAVES.tentativas, [{
      questao_id: DADOS.questoes[0].id, resposta: "A", correta: 1,
      respondida_em: new Date().toISOString(),
    }]);
    globalThis._nFulano = lerTentativas().length;
    usarPerfil(_p1);
  `);
  ok("voltar ao perfil anterior devolve o historico dele",
     rodar("lerTentativas().length") === rodar("_n1"),
     `${rodar("lerTentativas().length")} de ${rodar("_n1")}`);
  ok("o historico de um perfil nao vaza para o outro",
     rodar("_nFulano") === 1 && rodar("lerTentativas().length") !== 1);

  rodar(`
    globalThis._antes = lerPerfis().length;
    apagarPerfil(_novo.id);
    globalThis._depois = lerPerfis().length;
    globalThis._sobrou = localStorage.getItem("tc." + _novo.id + ".tentativas");
  `);
  ok("apagar perfil remove o perfil e os dados dele",
     rodar("_depois") === rodar("_antes") - 1 && rodar("_sobrou") === null);

  rodar(`
    globalThis._unico = (() => { try { apagarPerfil(perfilAtual.id); } catch (e) {}
                                 return lerPerfis().length; })();
  `);
  ok("nao da para apagar o unico perfil", rodar("_unico") === 1);

  rodar(`
    const reciclado = criarPerfil("Beltrano");
    globalThis._idReciclado = reciclado.id === _novo.id;
    apagarPerfil(reciclado.id);
  `);
  ok("o id de um perfil apagado nao volta a ser usado",
     rodar("_idReciclado") === false);

  // instalação anterior aos perfis: o histórico não pode sumir na atualização
  armazem.clear();
  rodar(`
    localStorage.setItem("tc.tentativas", JSON.stringify([{
      questao_id: DADOS.questoes[0].id, resposta: "A", correta: 1,
      respondida_em: "2026-01-01T00:00:00.000Z",
    }]));
    localStorage.setItem("tc.geminiKey", "chave-antiga");
    garantirPerfil();
    globalThis._migradas = lerTentativas().length;
    globalThis._chave = localStorage.getItem(CHAVES.apiKey);
    globalThis._legado = localStorage.getItem("tc.tentativas");
  `);
  ok("instalacao antiga migra o historico para o primeiro perfil",
     rodar("_migradas") === 1, `${rodar("_migradas")} respostas`);
  ok("a chave da API tambem migra", rodar("_chave") === "chave-antiga");
  ok("as chaves sem perfil somem depois de migradas",
     rodar("_legado") === null);

  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTodos os testes passaram.");
  process.exit(falhas ? 1 : 0);
}, 300);
