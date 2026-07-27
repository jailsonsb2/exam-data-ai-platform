/* Service worker: deixa o app abrir sem internet (ônibus, metrô, túnel).

   A "casca" do app e o banco de questões são baixados no primeiro acesso e
   servidos do cache dali em diante. Os recortes de PDF são pesados (~7 MB no
   total), então entram no cache sob demanda, conforme você esbarra nas
   questões que os usam.

   A versão abaixo é trocada pelo build_site.py a cada geração — é ela que faz
   o celular buscar os dados novos depois de um deploy. */

const VERSAO = "20260727005416";
const CACHE_CASCA = `treino-casca-${VERSAO}`;
const CACHE_IMG = `treino-img-${VERSAO}`;

const CASCA = [
  "./",
  "index.html",
  "app.js",
  "style.css",
  "manifest.webmanifest",
  "dados/questoes.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_CASCA)
      .then((c) => c.addAll(CASCA))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((n) => n !== CACHE_CASCA && n !== CACHE_IMG)
             .map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // chamadas à API do Gemini (outro domínio) passam direto
  if (url.origin !== self.location.origin) return;

  // navegação: cai no index.html mesmo offline
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match("index.html").then((r) => r || fetch(req))
    );
    return;
  }

  // recortes de PDF: cache sob demanda
  if (url.pathname.includes("/img/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE_IMG).then((c) => c.put(req, copia));
        }
        return resp;
      }).catch(() => hit))
    );
    return;
  }

  // casca e dados: cache primeiro, rede como reserva
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((resp) => {
      if (resp.ok) {
        const copia = resp.clone();
        caches.open(CACHE_CASCA).then((c) => c.put(req, copia));
      }
      return resp;
    }))
  );
});
