import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

// public/sw.js is a plain script, so it is run here in a sandbox with a fake Cache Storage and
// network. The case that matters: a page the server failed to render still answers 200, with the
// error inside its data, and must never become the offline copy.

const SOURCE = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const ORIGIN = "https://90x.test";

const GOOD = '<html><body>feed</body></html><script>self.__next_f.push([1,"ok"])</script>';
const BROKEN = String.raw`<html><body>feed</body></html><script>self.__next_f.push([1,"1d:E{\"digest\":\"811478078\"}\n"])</script>`;

// A same-origin response is "basic"; the constructor makes "default", so the type is set by hand.
const html = (body: string, status = 200) => {
  const response = new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
  Object.defineProperty(response, "type", { value: "basic" });
  return response;
};

function worker(network: { online: boolean; pages: Record<string, string>; status?: Record<string, number> }) {
  const stores = new Map<string, Map<string, Response>>();
  const open = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name)!;
    return {
      match: async (key: string | Request) => map.get(typeof key === "string" ? key : key.url)?.clone(),
      put: async (key: string | Request, response: Response) => void map.set(typeof key === "string" ? key : key.url, response),
      delete: async (key: string) => map.delete(key),
      keys: async () => [...map.keys()],
    };
  };
  const caches = {
    open: async (name: string) => open(name),
    match: async (key: string) => {
      for (const map of stores.values()) {
        const hit = map.get(key.startsWith("/") ? ORIGIN + key : key);
        if (hit) return hit.clone();
      }
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const listeners: Record<string, ((event: unknown) => void)[]> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (event: unknown) => void) => void (listeners[type] ??= []).push(fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
    registration: {},
  };
  const fetched: string[] = [];
  const fetchStub = async (input: string | Request) => {
    const url = typeof input === "string" ? input : input.url;
    fetched.push(url);
    if (!network.online) throw new TypeError("offline");
    const path = new URL(url).pathname;
    return html(network.pages[path] ?? GOOD, network.status?.[path]);
  };
  vm.runInNewContext(SOURCE, { self, caches, fetch: fetchStub, URL, Response, Request, Promise, console, Headers, Blob });

  const pending: Promise<unknown>[] = [];
  const told: Record<string, unknown>[] = [];
  const event = (extra: object) => ({
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
    source: { postMessage: (message: Record<string, unknown>) => void told.push(message) },
    ...extra,
  });
  return {
    fetched,
    told,
    async message(data: object) {
      for (const fn of listeners.message ?? []) fn(event({ data }));
      await Promise.all(pending.splice(0));
    },
    async navigate(path: string): Promise<Response> {
      let answer: Promise<Response> | undefined;
      const request = new Request(ORIGIN + path, { method: "GET" });
      Object.defineProperty(request, "mode", { value: "navigate" });
      for (const fn of listeners.fetch ?? []) fn(event({ request, respondWith: (p: Promise<Response>) => (answer = p) }));
      const response = await answer!;
      await Promise.all(pending.splice(0));
      return response;
    },
    kept: async (path: string) => {
      const hit = await caches.match(path);
      return hit ? await hit.text() : null;
    },
    store: async (path: string, body: string) => (await caches.open("90x-pages-v2")).put(ORIGIN + path, html(body)),
    setOnline: (online: boolean) => void (network.online = online),
    caches,
    storeAudio: async (path: string, bytes: Uint8Array<ArrayBuffer>) =>
      (await caches.open("90x-audio-v1")).put(
        ORIGIN + path,
        new Response(bytes, { headers: { "content-type": "audio/mpeg", "content-length": String(bytes.length) } }),
      ),
    /** A plain (non-navigation) GET, as <audio> makes; falls back to the network stub when unanswered. */
    async request(path: string, headers: Record<string, string> = {}): Promise<Response> {
      let answer: Promise<Response> | undefined;
      const request = new Request(ORIGIN + path, { method: "GET", headers });
      for (const fn of listeners.fetch ?? []) fn(event({ request, respondWith: (p: Promise<Response>) => (answer = p) }));
      if (!answer) return fetchStub(request);
      const response = await answer;
      await Promise.all(pending.splice(0));
      return response;
    },
    async activate() {
      for (const fn of listeners.activate ?? []) fn(event({}));
      await Promise.all(pending.splice(0));
    },
    cacheNames: () => caches.keys(),
  };
}

describe("forgetting the offline copies", () => {
  it("drops the kept pages and tells the page it is done", async () => {
    const sw = worker({ online: true, pages: { "/today": GOOD } });
    await sw.store("/today", GOOD);
    await sw.message({ type: "forget-pages" });
    expect(await sw.kept("/today")).toBeNull();
    expect(sw.told).toContainEqual({ type: "forget-pages-done", ok: true });
  });
});

describe("the offline copy of Today and the Feed", () => {
  it("keeps a healthy page", async () => {
    const sw = worker({ online: true, pages: { "/feed": GOOD } });
    await sw.message({ type: "warm-pages" });
    expect(await sw.kept("/feed")).toBe(GOOD);
  });

  it("does not keep a page the server failed to render, even though it answered 200", async () => {
    const sw = worker({ online: true, pages: { "/feed": BROKEN } });
    await sw.message({ type: "warm-pages" });
    expect(await sw.kept("/feed")).toBeNull();
    // A normal visit that hits the same failure does not keep it either.
    await sw.navigate("/feed");
    expect(await sw.kept("/feed")).toBeNull();
  });

  it("never replaces a good copy with a broken one", async () => {
    const sw = worker({ online: true, pages: { "/feed": GOOD } });
    await sw.message({ type: "warm-pages" });
    sw.setOnline(true);
    const broken = worker({ online: true, pages: { "/feed": BROKEN } });
    await broken.store("/feed", GOOD);
    await broken.message({ type: "warm-pages", refresh: true });
    expect(await broken.kept("/feed")).toBe(GOOD);
  });

  it("renews copies only when asked to refresh", async () => {
    const sw = worker({ online: true, pages: { "/feed": "<html>new</html>" } });
    await sw.store("/feed", GOOD);
    await sw.message({ type: "warm-pages" });
    expect(await sw.kept("/feed")).toBe(GOOD);
    await sw.message({ type: "warm-pages", refresh: true });
    expect(await sw.kept("/feed")).toBe("<html>new</html>");
  });

  it("serves a good copy offline", async () => {
    const sw = worker({ online: true, pages: { "/feed": GOOD } });
    await sw.message({ type: "warm-pages" });
    sw.setOnline(false);
    expect(await (await sw.navigate("/feed")).text()).toBe(GOOD);
  });

  it("heals a copy that was kept while the server was failing: offline, it falls back to the offline page and forgets it", async () => {
    const sw = worker({ online: true, pages: { "/offline": "<html>offline page</html>" } });
    await sw.store("/offline", "<html>offline page</html>");
    await sw.store("/feed", BROKEN);
    sw.setOnline(false);
    expect(await (await sw.navigate("/feed")).text()).toBe("<html>offline page</html>");
    expect(await sw.kept("/feed")).toBeNull();
  });

  it("tells the page a refresh worked only when every copy is good", async () => {
    const good = worker({ online: true, pages: {} });
    await good.message({ type: "warm-pages", refresh: true });
    expect(good.told).toEqual([{ type: "warm-pages-done", refresh: true, ok: true }]);

    const failing = worker({ online: true, pages: { "/feed": BROKEN } });
    await failing.message({ type: "warm-pages", refresh: true });
    expect(failing.told).toEqual([{ type: "warm-pages-done", refresh: true, ok: false }]);

    const offline = worker({ online: false, pages: {} });
    await offline.message({ type: "warm-pages", refresh: true });
    expect(offline.told).toEqual([{ type: "warm-pages-done", refresh: true, ok: false }]);
  });

  it("a plain warm that finds the copies already there reports success without refreshing", async () => {
    const sw = worker({ online: true, pages: {} });
    await sw.store("/today", GOOD);
    await sw.store("/feed", GOOD);
    await sw.message({ type: "warm-pages" });
    expect(sw.told).toEqual([{ type: "warm-pages-done", refresh: false, ok: true }]);
  });
});

describe("maintenance mode", () => {
  const DOWN = "<html><body>90x is down for maintenance.</body></html>";

  it("shows the 503 maintenance page online rather than a kept copy, and never keeps it", async () => {
    const sw = worker({ online: true, pages: { "/today": DOWN, "/feed": DOWN }, status: { "/today": 503, "/feed": 503 } });
    await sw.store("/today", GOOD);
    const response = await sw.navigate("/today");
    expect(response.status).toBe(503);
    expect(await response.text()).toBe(DOWN);
    // The good copy stays for offline use; the maintenance page never replaces it.
    expect(await sw.kept("/today")).toBe(GOOD);
    await sw.message({ type: "warm-pages", refresh: true });
    expect(await sw.kept("/today")).toBe(GOOD);
    expect(await sw.kept("/feed")).toBeNull();
  });
});

describe("downloaded audio", () => {
  const BYTES = new Uint8Array(1000).map((_, i) => i % 256);
  const PATH = "/audio/lessons/sliding-window-abcdef12.mp3";

  it("keeps the audio cache on activate and drops other old 90x caches", async () => {
    const sw = worker({ online: true, pages: {} });
    await sw.storeAudio(PATH, BYTES);
    await (await sw.caches.open("90x-pages-v1")).put(ORIGIN + "/x", html("old"));
    await sw.activate();
    const names = await sw.cacheNames();
    expect(names).toContain("90x-audio-v1");
    expect(names).not.toContain("90x-pages-v1");
  });

  it("answers a downloaded file in full without a Range header", async () => {
    const sw = worker({ online: true, pages: {} });
    await sw.storeAudio(PATH, BYTES);
    const r = await sw.request(PATH);
    expect(r.status).toBe(200);
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(BYTES);
  });

  it("slices a Range request and answers 206 with Content-Range", async () => {
    const sw = worker({ online: true, pages: {} });
    await sw.storeAudio(PATH, BYTES);
    const r = await sw.request(PATH, { range: "bytes=100-199" });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(r.headers.get("content-length")).toBe("100");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(BYTES.slice(100, 200));
  });

  it("answers an open-ended range to the end of the file, clamping an end past it", async () => {
    const sw = worker({ online: true, pages: {} });
    await sw.storeAudio(PATH, BYTES);
    const open = await sw.request(PATH, { range: "bytes=900-" });
    expect(open.status).toBe(206);
    expect(open.headers.get("content-range")).toBe("bytes 900-999/1000");
    const past = await sw.request(PATH, { range: "bytes=990-5000" });
    expect(past.headers.get("content-range")).toBe("bytes 990-999/1000");
  });

  it("answers a suffix range with the last n bytes", async () => {
    const sw = worker({ online: true, pages: {} });
    await sw.storeAudio(PATH, BYTES);
    const r = await sw.request(PATH, { range: "bytes=-100" });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 900-999/1000");
  });

  it("answers 416 past the end", async () => {
    const sw = worker({ online: true, pages: {} });
    await sw.storeAudio(PATH, BYTES);
    const r = await sw.request(PATH, { range: "bytes=1000-" });
    expect(r.status).toBe(416);
    expect(r.headers.get("content-range")).toBe("bytes */1000");
  });

  it("lets a file that is not downloaded go to the network", async () => {
    const sw = worker({ online: true, pages: { [PATH]: "<html>404</html>" }, status: { [PATH]: 404 } });
    const r = await sw.request(PATH);
    expect(r.status).toBe(404);
    expect(sw.fetched).toContain(ORIGIN + PATH);
  });

  it("forgets every download on request and says so", async () => {
    const sw = worker({ online: true, pages: {} });
    await sw.storeAudio(PATH, BYTES);
    await sw.message({ type: "forget-audio" });
    expect(await sw.cacheNames()).not.toContain("90x-audio-v1");
    expect(sw.told).toContainEqual({ type: "forget-audio-done", ok: true });
  });
});
