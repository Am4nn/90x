// Downloaded lessons live in Cache Storage under a stable same-origin path; the service worker answers
// that path (with Range support, public/sw.js). Browser only; every call catches and falls back, since
// storage can be missing or full. Never import this from a server component.

import type { FeedArea } from "@/lib/feed/view";

export const AUDIO_CACHE = "90x-audio-v1";
const PREFIX = "/audio/";
const META_PREFIX = "/audio/meta/";
const WORKER_REPLY_MS = 5000;

/** `area` and `durationS` feed the Settings list (topic colour, length); absent on very old entries. */
export type Downloaded = {
  r2Key: string;
  topicSlug: string;
  title: string;
  bytes: number;
  downloadedAt: number;
  area?: FeedArea | null;
  durationS?: number;
};

export const audioPath = (r2Key: string) => `${PREFIX}${r2Key}`;
export const metaPath = (r2Key: string) => `${META_PREFIX}${r2Key}.json`;
const full = (path: string) => `${location.origin}${path}`;

/** Downloads work only with Cache Storage and a controlling worker: without the worker /audio/... would 404. */
function usable(): boolean {
  try {
    return typeof caches !== "undefined" && Boolean(navigator.serviceWorker?.controller);
  } catch {
    return false;
  }
}

export async function isDownloaded(r2Key: string): Promise<boolean> {
  if (!usable()) return false;
  try {
    return Boolean(await (await caches.open(AUDIO_CACHE)).match(full(audioPath(r2Key))));
  } catch {
    return false;
  }
}

/** The body as one Blob, reporting the share received when the size is known (the mock's progress ring). */
async function readAll(response: Response, onProgress?: (share: number) => void): Promise<Blob> {
  const total = Number(response.headers.get("content-length")) || 0;
  if (!onProgress || !total || !response.body) return response.blob();
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    received += value.length;
    onProgress(Math.min(1, received / total));
  }
  return new Blob(parts as BlobPart[]);
}

export async function downloadLesson(
  input: { r2Key: string; topicSlug: string; title: string; signedUrl: string; area?: FeedArea | null; durationS?: number },
  onProgress?: (share: number) => void,
): Promise<Downloaded | null> {
  if (!usable()) return null;
  try {
    const response = await fetch(input.signedUrl);
    if (!response.ok) return null;
    const blob = await readAll(response, onProgress);
    const meta: Downloaded = {
      r2Key: input.r2Key,
      topicSlug: input.topicSlug,
      title: input.title,
      bytes: blob.size,
      downloadedAt: Date.now(),
      area: input.area ?? null,
      durationS: input.durationS,
    };
    const cache = await caches.open(AUDIO_CACHE);
    await cache.put(
      full(audioPath(input.r2Key)),
      new Response(blob, { headers: { "content-type": "audio/mpeg", "content-length": String(blob.size) } }),
    );
    await cache.put(full(metaPath(input.r2Key)), new Response(JSON.stringify(meta), { headers: { "content-type": "application/json" } }));
    return meta;
  } catch {
    return null;
  }
}

export async function downloadedLessons(): Promise<Downloaded[]> {
  if (typeof caches === "undefined") return [];
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const out: Downloaded[] = [];
    for (const request of await cache.keys()) {
      if (!new URL(request.url).pathname.startsWith(META_PREFIX)) continue;
      const hit = await cache.match(request.url);
      if (hit) out.push((await hit.json()) as Downloaded);
    }
    return out.toSorted((a, b) => b.downloadedAt - a.downloadedAt);
  } catch {
    return [];
  }
}

export async function deleteDownload(r2Key: string): Promise<void> {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    await Promise.all([cache.delete(full(audioPath(r2Key))), cache.delete(full(metaPath(r2Key)))]);
  } catch {
    // Nothing to delete, or no storage.
  }
}

/** Every download, gone: asks the worker (so an in-flight write is not kept) and deletes the cache here too. */
export async function forgetDownloads(): Promise<boolean> {
  try {
    const worker = (await navigator.serviceWorker?.getRegistration())?.active;
    const workerOk = worker
      ? await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => done(false), WORKER_REPLY_MS);
          const onMessage = (event: MessageEvent) => {
            if (event.data?.type === "forget-audio-done") done(event.data.ok === true);
          };
          function done(ok: boolean) {
            clearTimeout(timer);
            navigator.serviceWorker.removeEventListener("message", onMessage);
            resolve(ok);
          }
          navigator.serviceWorker.addEventListener("message", onMessage);
          worker.postMessage({ type: "forget-audio" }, []);
        })
      : true;
    if (typeof caches !== "undefined") await caches.delete(AUDIO_CACHE);
    return workerOk;
  } catch {
    return false;
  }
}
