// Minimal PWA service worker for Nutrition Tracker.
//
// What this SW does:
//   1. Satisfies the "registered service worker that controls the page"
//      criterion Chrome uses to decide whether to offer Add-to-Home-Screen
//      / install prompts.
//   2. Precaches the icon set + manifest so the installed app launches
//      with its branded chrome immediately, even before the network has
//      replied.
//   3. Cache-first on hashed static build artifacts under /_next/ — fast
//      repeat loads on flaky cellular without risking stale HTML.
//
// What this SW deliberately does NOT do:
//   - Cache HTML pages. The data on every page (today's totals, the day's
//     entries) changes minute-by-minute as the user logs meals; a stale
//     Today screen would be worse than no PWA at all. plan.md §9 also
//     commits the app to "online required" for logging, so a true offline
//     experience isn't a v1 goal.
//   - Touch cross-origin requests (Supabase Storage, Gemini, etc.).
//     Those go straight to the network so signed URLs and AI calls
//     behave exactly as they would without the SW.
//   - Touch mutations (POST/PUT/DELETE). Server actions are network-only.
//
// Bumping VERSION rolls the cache; the activate hook deletes any cache
// whose name doesn't match the current VERSION.

const VERSION = "v1";
const CACHE = `nutrition-${VERSION}`;

const PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/apple-touch-icon.png",
  "/favicon-32.png",
  "/favicon-16.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
  // Activate immediately — there's no risk of breaking an in-flight
  // session because we don't intercept HTML or mutations.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/favicon-16.png" ||
    url.pathname === "/favicon-32.png";

  if (!isStaticAsset) return; // HTML + everything else: passthrough.

  // Cache-first for static assets. Lazily fill the cache on first miss.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
