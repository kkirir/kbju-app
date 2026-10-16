// Service worker: оболочка приложения доступна без сети.
// Стратегия: сначала сеть (чтобы обновления приходили сразу), без сети — из кэша.
// Запросы к другим доменам (api.anthropic.com, Open Food Facts) не трогаем.

const CACHE = "kbju-shell-v2";
// Ядро оболочки: без любого из этих файлов приложение не работает офлайн — установка падает.
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./src/app.js",
  "./src/nutrition.js",
  "./src/store.js",
  "./src/ai.js",
  "./src/image.js",
  "./src/foodfacts.js",
  "./src/ui/dom.js",
  "./src/ui/state.js",
  "./src/ui/today.js",
  "./src/ui/review.js",
  "./src/ui/add-sheet.js",
  "./src/ui/recent.js",
  "./src/ui/manual.js",
  "./src/ui/profile.js",
  "./src/ui/onboarding.js",
  "./src/ui/settings.js",
  "./src/ui/capture.js",
];

// Необязательное: иконки. Пропуск не ломает установку.
const OPTIONAL = [
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const fresh = (url) => new Request(url, { cache: "reload" });

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll отклоняется, если хоть один файл ядра не скачался (сеть или не 2xx).
    await cache.addAll(CORE.map(fresh));
    await Promise.all(OPTIONAL.map((url) => cache.add(fresh(url)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("kbju-shell-") && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    } catch {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === "navigate") {
        const shell = (await cache.match("./index.html")) || (await cache.match("./"));
        if (shell) return shell;
      }
      return new Response("Нет сети", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
