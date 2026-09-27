// 90x service worker: shows push notifications and opens the app on tap, and
// keeps an offline copy of the app: Today and the Feed network-first
// with the last good copy as fallback, static assets from the cache, an
// offline page for every other page. Registered by
// src/components/offline/service-worker.tsx.

const VERSION = "v1";
const SHELL = `90x-shell-${VERSION}`;
const PAGES = `90x-pages-${VERSION}`;
const ASSETS = `90x-assets-${VERSION}`;
const OFFLINE_URL = "/offline";
// The only signed-in pages kept on the device, so no other personal
// page outlives the visit. Warmed even if never opened here, so they work
// offline from the first day. Server actions are POSTs and never reach the cache.
const OFFLINE_PAGES = ["/today", "/feed"];
const MAX_PAGES = OFFLINE_PAGES.length;
const MAX_ASSETS = 300;
// Bumped by forget-pages (sign-out), so a page fetched before it is never written after it.
let pageEpoch = 0;

self.addEventListener("install", (event) => {
  // A failed precache must not stop the worker installing: push depends on it too.
  event.waitUntil(
    cachePage(OFFLINE_URL, { cacheName: SHELL })
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n.startsWith("90x-") && ![SHELL, PAGES, ASSETS].includes(n)).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(navigate(event, url));
    return;
  }
  if (isAsset(url)) event.respondWith(asset(event));
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "cache-assets" && Array.isArray(data.assets)) {
    event.waitUntil(cacheAssets(data.assets).catch(() => undefined));
  } else if (data.type === "warm-pages") {
    event.waitUntil(Promise.all(OFFLINE_PAGES.map((path) => cachePage(path, { onlyIfMissing: true }).catch(() => undefined))));
  } else if (data.type === "forget-pages") {
    pageEpoch++;
    event.waitUntil(caches.delete(PAGES));
  }
});

const pageKey = (url) => `${url.origin}${url.pathname}`;
const cacheablePage = (url) => OFFLINE_PAGES.includes(url.pathname);
const isAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/icons/") ||
  url.pathname === "/favicon.ico" ||
  url.pathname === "/manifest.webmanifest";

// A signed-in HTML page, not a redirect (to /sign-in, say) or an error.
const storablePage = (response) =>
  response.ok && !response.redirected && response.type === "basic" && (response.headers.get("content-type") || "").includes("text/html");

// Hashed build files are only cached once marked immutable, which `next dev` never does.
function storableAsset(url, response) {
  if (!response.ok || response.type !== "basic") return false;
  if (!url.pathname.startsWith("/_next/static/")) return true;
  return (response.headers.get("cache-control") || "").includes("immutable");
}

async function navigate(event, url) {
  const epoch = pageEpoch;
  try {
    const response = await fetch(event.request);
    if (cacheablePage(url) && storablePage(response)) {
      const copy = response.clone();
      event.waitUntil(put(PAGES, pageKey(url), copy, MAX_PAGES, () => epoch === pageEpoch));
    }
    return response;
  } catch (error) {
    const cached = cacheablePage(url) ? await caches.match(pageKey(url), { ignoreVary: true }) : undefined;
    const fallback = cached || (await caches.match(OFFLINE_URL, { ignoreVary: true }));
    if (fallback) return fallback;
    throw error;
  }
}

// Stale-while-revalidate. Files under /_next/static have content hashes and
// never change, so a cached one is served without asking the network again.
async function asset(event) {
  const url = new URL(event.request.url);
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(event.request, { ignoreVary: true });
  if (cached && url.pathname.startsWith("/_next/static/")) return cached;
  const network = fetch(event.request).then((response) => {
    if (storableAsset(url, response)) event.waitUntil(put(ASSETS, event.request, response.clone(), MAX_ASSETS));
    return response;
  });
  if (!cached) return network;
  event.waitUntil(network.catch(() => undefined));
  return cached;
}

// `stillWanted` is checked once the cache is open: a write to a cache deleted
// after that lands in the orphaned copy, which nothing reads.
async function put(cacheName, key, response, max, stillWanted = () => true) {
  try {
    const cache = await caches.open(cacheName);
    if (!stillWanted()) return;
    await cache.put(key, response);
    // Keys come back oldest-written first, so the oldest go.
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
  } catch {
    // Storage full or the response can't be stored: the network copy still went to the page.
  }
}

async function cacheAssets(urls) {
  const cache = await caches.open(ASSETS);
  const wanted = [...new Set(urls)].flatMap((raw) => {
    try {
      const url = new URL(raw, self.location.origin);
      return url.origin === self.location.origin && isAsset(url) ? [url] : [];
    } catch {
      return [];
    }
  });
  await Promise.all(
    wanted.map(async (url) => {
      if (await cache.match(url.href, { ignoreVary: true })) return;
      const response = await fetch(url.href);
      if (storableAsset(url, response)) await put(ASSETS, url.href, response, MAX_ASSETS);
    }),
  );
}

// Fetches a page as the signed-in user, keeps it, and keeps the build files it
// names, so it can render offline without ever having been opened here.
async function cachePage(path, { onlyIfMissing = false, cacheName = PAGES } = {}) {
  const url = new URL(path, self.location.origin);
  const epoch = pageEpoch;
  if (onlyIfMissing && (await caches.match(pageKey(url), { ignoreVary: true }))) return;
  const response = await fetch(url.href, { credentials: "same-origin" });
  if (!storablePage(response)) return;
  const html = await response.clone().text();
  await put(cacheName, pageKey(url), response, MAX_PAGES, () => cacheName !== PAGES || epoch === pageEpoch);
  await cacheAssets(html.match(/\/_next\/static\/[^"'\s\\)<>]+/g) || []);
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "90x", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "90x", {
      body: data.body || "",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: data.tag || "90x",
      data: { url: data.url || "/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/today", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin)) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
