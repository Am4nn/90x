import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audio/env", () => ({ audioEnv: vi.fn() }));
vi.mock("@/lib/audio/queries", () => ({ audioFor: vi.fn() }));
vi.mock("@/lib/audio/sign", () => ({ SIGNED_URL_TTL_S: 43_200, signAudioUrl: vi.fn(async (k: string) => `https://r2.test/${k}?sig=1`) }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));

import { DEMO_AUDIO_SLUG } from "@/lib/audio/demo";
import { audioEnv } from "@/lib/audio/env";
import { audioFor } from "@/lib/audio/queries";
import { signAudioUrl } from "@/lib/audio/sign";
import { GET } from "./route";

const ENV = { accountId: "a", accessKeyId: "k", secretAccessKey: "s", bucket: "b" };
const ROW = { r2Key: "lessons/ai-generative-ai-llms-1234abcd.mp3", durationS: 400, lines: [] };

describe("public demo audio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("signs the demo lesson's file only, and lets the CDN keep the answer for an hour", async () => {
    vi.mocked(audioEnv).mockReturnValue(ENV);
    vi.mocked(audioFor).mockResolvedValue(ROW);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(vi.mocked(audioFor)).toHaveBeenCalledExactlyOnceWith(DEMO_AUDIO_SLUG);
    expect(vi.mocked(signAudioUrl)).toHaveBeenCalledExactlyOnceWith(ROW.r2Key, ENV);
    const body = await res.json();
    expect(body).toMatchObject({ slug: DEMO_AUDIO_SLUG, url: `https://r2.test/${ROW.r2Key}?sig=1`, durationS: 400, lines: [] });
    // The URL lives 12 h; cached at most 1 h plus 1 h stale, so a cached URL always has 10 h left.
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=3600, stale-while-revalidate=3600");
  });

  it("answers 404 for a minute while the demo lesson has no published audio", async () => {
    vi.mocked(audioEnv).mockReturnValue(ENV);
    vi.mocked(audioFor).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=60");
    expect(vi.mocked(signAudioUrl)).not.toHaveBeenCalled();
  });

  it("answers 404 without the read-only R2 env, and never touches the database", async () => {
    vi.mocked(audioEnv).mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
    expect(vi.mocked(audioFor)).not.toHaveBeenCalled();
  });

  it("answers 503, not cached and not thrown, when the database lookup fails", async () => {
    vi.mocked(audioEnv).mockReturnValue(ENV);
    vi.mocked(audioFor).mockRejectedValueOnce(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(vi.mocked(signAudioUrl)).not.toHaveBeenCalled();
  });

  it("is not cached when signing fails", async () => {
    vi.mocked(audioEnv).mockReturnValue(ENV);
    vi.mocked(audioFor).mockResolvedValue(ROW);
    vi.mocked(signAudioUrl).mockRejectedValueOnce(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
