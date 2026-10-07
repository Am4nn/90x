// 90x service worker: shows push notifications and opens the app on tap, and
// keeps an offline copy of the app: Today and the Feed network-first
// with the last good copy as fallback, static assets from the cache, an
// offline page for every other page. Registered by
// src/components/offline/service-worker.tsx.

// v2: wipes every copy v1 kept, including any page cached while the server was failing (see hasServerError).
const VERSION = "v2";
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
    // `refresh`: the copies are old, so fetch them again rather than only filling gaps. A reader who
    // moves between tabs never makes a page request, so nothing else would ever renew them.
    const onlyIfMissing = data.refresh !== true;
    // Tells the page whether every copy is now good, so a failed refresh is retried rather than counted.
    event.waitUntil(
      Promise.all(OFFLINE_PAGES.map((path) => cachePage(path, { onlyIfMissing }).catch(() => false))).then((results) =>
        event.source?.postMessage({ type: "warm-pages-done", refresh: !onlyIfMissing, ok: results.every(Boolean) }),
      ),
    );
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
  url.pathname === "/icon.svg" ||
  url.pathname === "/apple-icon.png" ||
  url.pathname === "/manifest.webmanifest";

// A signed-in HTML page, not a redirect (to the landing page, say) or an error. The maintenance page answers
// 503, so it is shown (navigations are network-first) but never kept, and never replaces a good copy.
const storablePage = (response) =>
  response.ok && !response.redirected && response.type === "basic" && (response.headers.get("content-type") || "").includes("text/html");

// A server error inside a streamed page does not change its status: the page still answers 200, with the
// error written into the page data as E{"digest":"..."}. Kept as the offline copy, that error shows on
// every offline open, and nothing replaces it for a reader who never loads the page afresh.
const hasServerError = (html) => /E\{\\"digest\\":/.test(html);

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
      event.waitUntil(keepIfSound(pageKey(url), copy, epoch));
    }
    return response;
  } catch (error) {
    let cached = cacheablePage(url) ? await caches.match(pageKey(url), { ignoreVary: true }) : undefined;
    // A copy kept while the server was failing is worse than none: say we are offline instead.
    if (cached && hasServerError(await cached.clone().text())) {
      event.waitUntil(forget(pageKey(url)));
      cached = undefined;
    }
    const fallback = cached || (await caches.match(OFFLINE_URL, { ignoreVary: true }));
    if (fallback) return fallback;
    throw error;
  }
}

/** Keeps a page copy unless the page carries a server error. */
async function keepIfSound(key, response, epoch) {
  const html = await response.clone().text();
  if (hasServerError(html)) return;
  await put(PAGES, key, response, MAX_PAGES, () => epoch === pageEpoch);
}

async function forget(key) {
  try {
    await (await caches.open(PAGES)).delete(key);
  } catch {
    // Nothing to forget.
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
// True when a good copy is kept afterwards; false when the page could not be kept (a redirect, an
// error, or a server error inside the page), so the caller can try again later.
async function cachePage(path, { onlyIfMissing = false, cacheName = PAGES } = {}) {
  const url = new URL(path, self.location.origin);
  const epoch = pageEpoch;
  if (onlyIfMissing && (await caches.match(pageKey(url), { ignoreVary: true }))) return true;
  const response = await fetch(url.href, { credentials: "same-origin" });
  if (!storablePage(response)) return false;
  const html = await response.clone().text();
  if (hasServerError(html)) return false;
  await put(cacheName, pageKey(url), response, MAX_PAGES, () => cacheName !== PAGES || epoch === pageEpoch);
  await cacheAssets(html.match(/\/_next\/static\/[^"'\s\\)<>]+/g) || []);
  return true;
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
      icon: "/icons/icon-192.png",
      tag: data.tag || "90x",
      data: { url: data.url || "/today" },
    }),
  );
});

// The browser rotated or dropped our subscription. Subscribe again with the same key and tell the
// server, or pushes keep going to an endpoint that no longer works.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const key = event.oldSubscription?.options?.applicationServerKey;
      const sub =
        event.newSubscription ||
        (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null);
      if (!sub) return;
      await fetch("/api/push/resync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
    })().catch(() => undefined),
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
