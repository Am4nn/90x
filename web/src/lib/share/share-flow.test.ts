import { describe, expect, it, vi } from "vitest";
import { copyLink, type ShareSteps, shareOrCopy } from "./share-flow";

function steps(over: Partial<ShareSteps> = {}) {
  return {
    mode: "link" as const,
    share: vi.fn(async () => {}),
    copy: vi.fn(async () => {}),
    counted: vi.fn(),
    ...over,
  };
}

describe("shareOrCopy", () => {
  it("counts a share that went through, once, and copies nothing", async () => {
    const s = steps();
    expect(await shareOrCopy(s)).toBe("shared");
    expect(s.share).toHaveBeenCalledWith(false);
    expect(s.copy).not.toHaveBeenCalled();
    expect(s.counted).toHaveBeenCalledTimes(1);
  });

  it("shares the PNG itself in files mode", async () => {
    const s = steps({ mode: "files" });
    await shareOrCopy(s);
    expect(s.share).toHaveBeenCalledWith(true);
  });

  it("does not count a closed share sheet (AbortError), and does not copy instead", async () => {
    const s = steps({ share: vi.fn(async () => Promise.reject(new DOMException("closed", "AbortError"))) });
    expect(await shareOrCopy(s)).toBe("cancelled");
    expect(s.copy).not.toHaveBeenCalled();
    expect(s.counted).not.toHaveBeenCalled();
  });

  it("falls back to a copy when the share fails, and counts it once, not twice", async () => {
    const s = steps({ share: vi.fn(async () => Promise.reject(new DOMException("denied", "NotAllowedError"))) });
    expect(await shareOrCopy(s)).toBe("copied");
    expect(s.copy).toHaveBeenCalledTimes(1);
    expect(s.counted).toHaveBeenCalledTimes(1);
  });

  it("counts nothing when the share fails and the copy fails too", async () => {
    const s = steps({
      share: vi.fn(async () => Promise.reject(new TypeError("no"))),
      copy: vi.fn(async () => Promise.reject(new Error("no clipboard"))),
    });
    expect(await shareOrCopy(s)).toBe("not-copied");
    expect(s.counted).not.toHaveBeenCalled();
  });

  it("copies on a device with no share sheet, counted once", async () => {
    const s = steps({ mode: "none" });
    expect(await shareOrCopy(s)).toBe("copied");
    expect(s.share).not.toHaveBeenCalled();
    expect(s.counted).toHaveBeenCalledTimes(1);
  });
});

describe("copyLink", () => {
  it("counts a copy once", async () => {
    const s = steps();
    expect(await copyLink(s)).toBe("copied");
    expect(s.counted).toHaveBeenCalledTimes(1);
  });

  it("counts nothing when the clipboard refuses", async () => {
    const s = steps({ copy: vi.fn(async () => Promise.reject(new Error("denied"))) });
    expect(await copyLink(s)).toBe("not-copied");
    expect(s.counted).not.toHaveBeenCalled();
  });
});
