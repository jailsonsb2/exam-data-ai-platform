/* Mede o layout real do site em viewports de celular e acusa qualquer
   elemento que estoure a largura da tela. */
import { chromium } from "playwright-core";

const EXE = "C:/Users/Jails/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = process.env.BASE || "http://127.0.0.1:8899";

const TELAS = [
  { nome: "iPhone SE", w: 375, h: 667 },
  { nome: "Android pequeno", w: 360, h: 740 },
  { nome: "Galaxy Fold (estreito)", w: 320, h: 653 },
];

let falhas = 0;
const ok = (nome, cond, extra = "") => {
  console.log(`${cond ? "  OK  " : "FALHA "} ${nome}${extra ? " -> " + extra : ""}`);
  if (!cond) falhas++;
};

const navegador = await chromium.launch({ executablePath: EXE });

for (const t of TELAS) {
  console.log(`\n=== ${t.nome} (${t.w}x${t.h}) ===`);
  const ctx = await navegador.newContext({
    viewport: { width: t.w, height: t.h },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#tela-filtros:not(.oculto)", { timeout: 15000 });

  ok("sem erro de JavaScript", erros.length === 0, erros.join("; "));

  // 1) a pagina inteira nao pode rolar na horizontal
  const rolagem = await page.evaluate(() =>
    ({ scroll: document.documentElement.scrollWidth,
       tela: document.documentElement.clientWidth }));
  ok("pagina nao rola na horizontal",
     rolagem.scroll <= rolagem.tela + 1,
     `scrollWidth ${rolagem.scroll} vs ${rolagem.tela}`);

  // 2) nenhum elemento visivel pode vazar a largura da tela
  const vazando = await page.evaluate(() => {
    const larg = document.documentElement.clientWidth;
    const fora = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (el.closest(".rolagem")) continue;          // tabelas rolam de proposito
      if (r.right > larg + 1 || r.left < -1) {
        fora.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} ` +
                  `(${Math.round(r.left)}..${Math.round(r.right)})`);
      }
    }
    return fora.slice(0, 6);
  });
  ok("nenhum elemento vaza a tela", vazando.length === 0, vazando.join(", "));

  // 3) alvos de toque
  const pequenos = await page.evaluate(() => {
    const ruins = [];
    for (const el of document.querySelectorAll("button, select, input")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.height < 36) {
        ruins.push(`${el.id || el.tagName}: ${Math.round(r.height)}px`);
      }
    }
    return ruins;
  });
  ok("alvos de toque com altura decente", pequenos.length === 0, pequenos.join(", "));

  // 4) o seletor de prova cabe e mostra texto util
  const prova = await page.evaluate(() => {
    const s = document.getElementById("f-prova");
    const r = s.getBoundingClientRect();
    return { largura: Math.round(r.width),
             tela: document.documentElement.clientWidth,
             maiorOpcao: Math.max(...[...s.options].map((o) => o.text.length)),
             exemplo: s.options[1] ? s.options[1].text : "" };
  });
  ok("seletor de prova cabe na tela", prova.largura <= prova.tela,
     `${prova.largura}px de ${prova.tela}px`);
  ok("rotulo de prova curto o bastante", prova.maiorOpcao <= 40,
     `${prova.maiorOpcao} caracteres | "${prova.exemplo}"`);

  // 5) tela de questao: o cabecalho longo e as alternativas
  await page.selectOption("#f-limit", "10");
  await page.click("#btn-iniciar");
  await page.waitForSelector("#tela-questao:not(.oculto)");
  await page.waitForSelector(".alternativa");

  const questao = await page.evaluate(() => {
    const larg = document.documentElement.clientWidth;
    const meta = document.getElementById("q-meta").getBoundingClientRect();
    const alts = [...document.querySelectorAll(".alternativa")]
      .map((a) => a.getBoundingClientRect());
    return {
      metaVaza: meta.right > larg + 1,
      altVaza: alts.some((r) => r.right > larg + 1),
      scroll: document.documentElement.scrollWidth, tela: larg,
    };
  });
  ok("cabecalho da questao nao vaza", !questao.metaVaza);
  ok("alternativas nao vazam", !questao.altVaza);
  ok("tela de questao nao rola na horizontal",
     questao.scroll <= questao.tela + 1,
     `${questao.scroll} vs ${questao.tela}`);

  // 6) responde uma questao e confere o feedback
  await page.click(".alternativa");
  await page.waitForSelector("#q-feedback:not(.oculto)");
  const depois = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    tela: document.documentElement.clientWidth,
    temJustificativa: !document.getElementById("q-justificativa")
                              .classList.contains("oculto"),
  }));
  ok("apos responder continua sem rolagem horizontal",
     depois.scroll <= depois.tela + 1, `${depois.scroll} vs ${depois.tela}`);
  ok("mostra a justificativa", depois.temJustificativa);

  // 7) demais telas
  for (const [aba, alvo] of [["nav-stats", "tela-stats"],
                             ["nav-redacao", "tela-redacao"],
                             ["nav-ajustes", "tela-ajustes"]]) {
    await page.click(`#${aba}`);
    await page.waitForSelector(`#${alvo}:not(.oculto)`);
    const r = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      tela: document.documentElement.clientWidth,
    }));
    ok(`${alvo} sem rolagem horizontal`, r.scroll <= r.tela + 1,
       `${r.scroll} vs ${r.tela}`);
  }

  await page.screenshot({ path: `mobile-${t.w}.png`, fullPage: true });
  await ctx.close();
}

await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nLayout mobile OK em todas as telas.");
process.exit(falhas ? 1 : 0);
