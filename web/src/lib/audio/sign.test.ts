import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { audioEnabled, audioEnv } from "./env";
import { SIGNED_URL_TTL_S, signAudioUrl } from "./sign";

const ENV = { accountId: "acct", accessKeyId: "AKIAREAD", secretAccessKey: "secret", bucket: "90x-audio" };

describe("signed audio URLs", () => {
  it("signs a 12-hour GET on the bucket's R2 endpoint with no network call", async () => {
    const url = new URL(await signAudioUrl("lessons/sliding-window-abcdef12.mp3", ENV, new Date("2026-10-09T10:00:00Z")));
    expect(url.origin).toBe("https://acct.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/90x-audio/lessons/sliding-window-abcdef12.mp3");
    expect(url.searchParams.get("X-Amz-Expires")).toBe(String(SIGNED_URL_TTL_S));
    expect(url.searchParams.get("X-Amz-Date")).toBe("20261009T100000Z");
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^AKIAREAD\/20261009\/auto\/s3\/aws4_request$/);
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(SIGNED_URL_TTL_S).toBe(43_200);
  });

  it("is disabled unless every read-only variable is set", () => {
    const saved = { ...process.env };
    try {
      for (const k of ["AUDIO_R2_ACCOUNT_ID", "AUDIO_R2_READ_ACCESS_KEY_ID", "AUDIO_R2_READ_SECRET_ACCESS_KEY", "AUDIO_R2_BUCKET"])
        delete process.env[k];
      expect(audioEnabled()).toBe(false);
      process.env.AUDIO_R2_ACCOUNT_ID = "a";
      process.env.AUDIO_R2_READ_ACCESS_KEY_ID = "k";
      process.env.AUDIO_R2_READ_SECRET_ACCESS_KEY = "s";
      expect(audioEnabled()).toBe(false);
      process.env.AUDIO_R2_BUCKET = "90x-audio";
      expect(audioEnabled()).toBe(true);
      expect(audioEnv()).toEqual({ accountId: "a", accessKeyId: "k", secretAccessKey: "s", bucket: "90x-audio" });
    } finally {
      process.env = saved;
    }
  });
});
