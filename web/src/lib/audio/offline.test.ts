import { afterEach, describe, expect, it } from "vitest";
import { AUDIO_CACHE, audioPath, deleteDownload, downloadLesson, downloadedLessons, isDownloaded, metaPath } from "./offline";

function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = {
    put: async (k: string, r: Response) => void store.set(k, r),
    match: async (k: string) => store.get(k)?.clone(),
    delete: async (k: string) => store.delete(k),
    keys: async () => [...store.keys()].map((k) => new Request(k)),
  };
  return { caches: { open: async () => cache, delete: async () => true, keys: async () => [AUDIO_CACHE] }, store };
}

const g = globalThis as Record<string, unknown>;
afterEach(() => {
  delete g.caches;
  delete g.navigator;
  delete g.fetch;
  delete g.location;
});

describe("offline audio", () => {
  it("keys the cache by the stable path, never the signed URL", () => {
    expect(audioPath("lessons/sliding-window-abcdef12.mp3")).toBe("/audio/lessons/sliding-window-abcdef12.mp3");
    expect(metaPath("lessons/sliding-window-abcdef12.mp3")).toBe("/audio/meta/lessons/sliding-window-abcdef12.mp3.json");
  });

  it("is not downloaded without a controlling service worker", async () => {
    g.caches = fakeCaches().caches;
    g.navigator = { serviceWorker: { controller: null } };
    expect(await isDownloaded("lessons/x.mp3")).toBe(false);
  });

  it("downloads from the signed URL, stores file and meta, lists and deletes", async () => {
    const { caches, store } = fakeCaches();
    g.caches = caches;
    g.navigator = { serviceWorker: { controller: {} } };
    g.location = { origin: "https://90x.test" };
    g.fetch = async (url: string) => {
      expect(url).toContain("X-Amz-Signature=abc");
      return new Response(new Uint8Array(48_000), { status: 200, headers: { "content-type": "audio/mpeg" } });
    };
    const d = await downloadLesson({
      r2Key: "lessons/x-1.mp3",
      topicSlug: "x",
      title: "X",
      signedUrl: "https://acct.r2.cloudflarestorage.com/90x-audio/lessons/x-1.mp3?X-Amz-Signature=abc",
    });
    expect(d).toMatchObject({ r2Key: "lessons/x-1.mp3", topicSlug: "x", title: "X", bytes: 48_000 });
    expect([...store.keys()]).toEqual(["https://90x.test/audio/lessons/x-1.mp3", "https://90x.test/audio/meta/lessons/x-1.mp3.json"]);
    expect(await isDownloaded("lessons/x-1.mp3")).toBe(true);
    expect((await downloadedLessons()).map((l) => l.title)).toEqual(["X"]);
    await deleteDownload("lessons/x-1.mp3");
    expect(await isDownloaded("lessons/x-1.mp3")).toBe(false);
    expect(await downloadedLessons()).toEqual([]);
  });

  it("returns null when the fetch fails and stores nothing", async () => {
    const { caches, store } = fakeCaches();
    g.caches = caches;
    g.navigator = { serviceWorker: { controller: {} } };
    g.location = { origin: "https://90x.test" };
    g.fetch = async () => new Response("expired", { status: 403 });
    expect(await downloadLesson({ r2Key: "lessons/y.mp3", topicSlug: "y", title: "Y", signedUrl: "https://x/y" })).toBeNull();
    expect(store.size).toBe(0);
  });
});

describe("download progress", () => {
  it("reports the share received as the body streams in", async () => {
    const { caches } = fakeCaches();
    g.caches = caches;
    g.navigator = { serviceWorker: { controller: {} } };
    g.location = { origin: "https://90x.test" };
    const chunk = new Uint8Array(1000);
    g.fetch = async () =>
      new Response(
        new ReadableStream({
          start(c) {
            for (let i = 0; i < 4; i++) c.enqueue(chunk);
            c.close();
          },
        }),
        { status: 200, headers: { "content-length": "4000" } },
      );
    const seen: number[] = [];
    const d = await downloadLesson({ r2Key: "lessons/p.mp3", topicSlug: "p", title: "P", signedUrl: "https://x/p" }, (share) =>
      seen.push(share),
    );
    expect(d?.bytes).toBe(4000);
    expect(seen).toEqual([0.25, 0.5, 0.75, 1]);
  });
});
