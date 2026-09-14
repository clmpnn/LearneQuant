/* ==========================================================================
   THE QUANT CURRICULUM — service worker

   The course is one large document. Downloading it once is reasonable;
   downloading it on every visit is not. This keeps a copy on the device, so
   the second visit paints from disk and a visit with no connection at all
   still works — which is the point of a book you are studying from.

   Two strategies, chosen by what the request is.

     navigations  network first, cache second. A deploy shows up on the next
                  visit rather than whenever a cache happens to expire, and
                  going offline still opens the course.
     assets       stale while revalidate. The cached copy answers instantly
                  and a fresh one is fetched in the background for next time.
                  This is what keeps the site correct even when it is served
                  straight from a branch with no build step to bump VERSION.
   ========================================================================== */
const VERSION = "__BUILD_ID__";
const FALLBACK_VERSION = "d65ce1aec5a4";
const TAG = "quant-" + (VERSION.indexOf("__") === 0 ? FALLBACK_VERSION : VERSION);
const SHELL_CACHE = TAG + "-shell";
const RUNTIME     = TAG + "-runtime";

/* Everything needed to open the course with no network at all. */
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/js/00-trainer-loader.js",
  "assets/js/10-dialog.js",
  "assets/js/20-search-index.js",
  "assets/js/21-reference.js",
  "assets/js/22-reference-data.js",
  "assets/js/23-reference-ui.js",
  "assets/js/30-spine.js",
  "assets/js/31-route-data.js",
  "assets/js/32-course.js",
  "assets/js/33-lessons.js",
  "assets/js/40-interface.js",
  "assets/icons/icon.svg",
  "assets/icons/favicon-32.png",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/maskable-512.png"
];

/* Large or secondary: fetched once the shell is safely in place, so the
   first visit is never slowed down by the practice engine. */
const LATER = [
  "assets/js/90-trainer.js",
  "assets/img/og.png",
  "404.html"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    /* one at a time, so a single 404 cannot fail the whole install */
    await Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("quant-") && k !== SHELL_CACHE && k !== RUNTIME)
                          .map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (err) {}
    }
    await self.clients.claim();
    const c = await caches.open(RUNTIME);
    await Promise.all(LATER.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})));
  })());
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

function cacheable(res) {
  return res && res.status === 200 && res.type !== "opaque";
}

async function networkFirst(e) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const preload = e.preloadResponse ? await e.preloadResponse : null;
    const res = preload || await fetch(e.request);
    if (cacheable(res)) cache.put("index.html", res.clone());
    return res;
  } catch (err) {
    return (await cache.match(e.request)) ||
           (await cache.match("index.html")) ||
           (await cache.match("./")) ||
           new Response("Offline, and this page is not in the cache yet.",
                        { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const hit = (await caches.match(req)) || null;
  const net = fetch(req).then((res) => {
    if (cacheable(res)) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await net) ||
         new Response("", { status: 504, statusText: "Offline" });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") { e.respondWith(networkFirst(e)); return; }
  e.respondWith(staleWhileRevalidate(req));
});
