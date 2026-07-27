/* Testa a edge function de Basic Auth real, com um shim do Deno.env. */
const AUTH = new URL("./auth.ts", import.meta.url).href;

globalThis.Deno = { env: { get: (k) => process.env[k] } };

let falhas = 0;
const ok = (nome, cond, extra = "") => {
  console.log(`${cond ? "  OK  " : "FALHA "} ${nome}${extra ? " -> " + extra : ""}`);
  if (!cond) falhas++;
};

const auth = (await import(AUTH)).default;
const ctx = { next: async () => new Response("CONTEUDO", { status: 200 }) };
const req = (header) =>
  new Request("https://x/dados/questoes.json",
              header ? { headers: { Authorization: header } } : undefined);
const basic = (u, p) => "Basic " + Buffer.from(`${u}:${p}`).toString("base64");

console.log("=== sem credenciais configuradas ===");
delete process.env.SITE_USER;
delete process.env.SITE_PASS;
let r = await auth(req(basic("a", "b")), ctx);
ok("falha fechada com 503 (nao serve o conteudo)", r.status === 503, `${r.status}`);
ok("mensagem explica o que configurar", (await r.text()).includes("SITE_USER"));

process.env.SITE_USER = "jailson";
process.env.SITE_PASS = "s3nh4-t3st3";

console.log("\n=== pedido sem autenticacao ===");
r = await auth(req(null), ctx);
ok("responde 401", r.status === 401, `${r.status}`);
ok("manda o navegador pedir usuario/senha",
   (r.headers.get("WWW-Authenticate") || "").startsWith("Basic realm="),
   r.headers.get("WWW-Authenticate"));
ok("nao deixa cachear a negativa", r.headers.get("Cache-Control") === "no-store");

console.log("\n=== credenciais erradas ===");
for (const [nome, u, p] of [
  ["usuario errado", "outro", "s3nh4-t3st3"],
  ["senha errada", "jailson", "errada"],
  ["ambos errados", "x", "y"],
  ["senha vazia", "jailson", ""],
  ["prefixo da senha certa", "jailson", "s3nh4"],
]) {
  r = await auth(req(basic(u, p)), ctx);
  ok(`bloqueia ${nome}`, r.status === 401, `${r.status}`);
}

console.log("\n=== cabecalhos malformados ===");
for (const [nome, h] of [
  ["esquema Bearer", "Bearer abc"],
  ["base64 invalido", "Basic !!!nao-e-base64!!!"],
  ["sem dois-pontos", "Basic " + Buffer.from("semseparador").toString("base64")],
  ["vazio", "Basic "],
]) {
  r = await auth(req(h), ctx);
  ok(`bloqueia ${nome}`, r.status === 401, `${r.status}`);
}

console.log("\n=== credenciais corretas ===");
r = await auth(req(basic("jailson", "s3nh4-t3st3")), ctx);
ok("libera o conteudo", r.status === 200, `${r.status}`);
ok("entrega o corpo real", (await r.text()) === "CONTEUDO");

console.log("\n=== senha contendo ':' ===");
process.env.SITE_PASS = "abc:def:ghi";
r = await auth(req(basic("jailson", "abc:def:ghi")), ctx);
ok("aceita senha com dois-pontos", r.status === 200, `${r.status}`);
r = await auth(req(basic("jailson", "abc")), ctx);
ok("nao aceita so o trecho antes do ':'", r.status === 401, `${r.status}`);

console.log("\n=== path coberto ===");
const cfg = (await import(AUTH)).config;
ok("protege todas as rotas", cfg.path === "/*", cfg.path);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTodos os testes passaram.");
process.exit(falhas ? 1 : 0);
