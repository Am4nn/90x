const renders = vi.hoisted(
  () => [] as { element: { props: { model: unknown; host: string } }; options: { width: number; height: number } }[],
);
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({ readFile: async () => Buffer.from("") }));
vi.mock("@/lib/site-url", () => ({ siteUrl: () => new URL("https://90x.amanarya.com") }));
vi.mock("@/lib/share/service", () => ({ cardModelForCode: vi.fn() }));
vi.mock("@/components/share/share-card", () => ({
  ShareCard: (props: { model: { dayNumber: number } }) => {
    if (props.model.dayNumber === -1) throw new Error("satori exploded");
    return null;
  },
}));
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(
      public element: { type: (props: unknown) => unknown; props: { model: unknown; host: string } },
      public options: { width: number; height: number },
    ) {
      renders.push({ element, options });
    }
    async arrayBuffer() {
      this.element.type(this.element.props);
      return new Uint8Array([137, 80, 78, 71]).buffer;
    }
  },
}));

import { cardModelForCode } from "@/lib/share/service";
import { GET } from "./route";

const lookup = vi.mocked(cardModelForCode);
const call = (code: string, query = "") => GET(new Request(`http://x/api/share/${code}${query}`));
const model = {
  dayNumber: 23,
  total: 90,
  done: 19,
  revived: 2,
  squares: [{ status: "done" as const, today: true }],
};

describe("GET /api/share/[code]", () => {
  beforeEach(() => {
    lookup.mockReset();
    renders.length = 0;
  });

  it("404s a malformed code without touching the database", async () => {
    for (const code of ["ABCDEFGH", "k7m2p9q", "k7m2p9qaa", "..%2Fx", "../x", "%2e%2e%2fx", "%3Cscript%3E", "%252e%252e", "k7m2-9qa"]) {
      const res = await call(code);
      expect(res.status).toBe(404);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("404s a malformed version without touching the database", async () => {
    for (const v of ["x", "1-", "-1", "1-2-3", "1e3-2", "23-19%20"]) {
      expect((await call("k7m2p9qa", `?v=${v}`)).status).toBe(404);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("serves a three-digit version, and 404s a four-digit one, for long campaigns", async () => {
    lookup.mockResolvedValue({ ...model, dayNumber: 100, total: 120 });
    expect((await call("k7m2p9qa", "?v=100-73")).status).toBe(200);
    lookup.mockClear();
    expect((await call("k7m2p9qa", "?v=1000-1")).status).toBe(404);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("404s a code ending in .png before any lookup", async () => {
    expect((await call("k7m2p9qa.png")).status).toBe(404);
    expect((await call("k7m2p9.png")).status).toBe(404);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("404s any query other than a single short v, without a lookup", async () => {
    for (const q of ["?utm=1", "?v=1-1&x=2", "?x=1&v=1-1", "?v=1-1&v=1-1", "?v=1000-1", "?v=1-1000", "?v=", "?x"]) {
      expect((await call("k7m2p9qa", q)).status, q).toBe(404);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("404s undecodable percent-encoding in the code instead of throwing", async () => {
    const bad = "%00%ff%25";
    expect((await call(bad)).status).toBe(404);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("answers 200 for a valid v, as an image with no cookie", async () => {
    lookup.mockResolvedValue(model);
    const res = await call("k7m2p9qa", "?v=23-19");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("answers 503, uncached, when the card fails to draw", async () => {
    lookup.mockResolvedValue({ ...model, dayNumber: -1 });
    const res = await call("k7m2p9qa");
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("404s an unknown code, with a short cache", async () => {
    lookup.mockResolvedValue(null);
    const res = await call("zzzzzzzz");
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("404s a code whose owner has no active campaign (the service answers null the same way)", async () => {
    lookup.mockResolvedValue(null);
    expect((await call("k7m2p9qa")).status).toBe(404);
    expect(lookup).toHaveBeenCalledWith("k7m2p9qa");
  });

  it("answers 503, uncached and without details, when the database fails", async () => {
    lookup.mockImplementation(async () => {
      throw new Error("password authentication failed for user postgres");
    });
    const res = await call("k7m2p9qa");
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("Unavailable");
  });

  it("renders a 1200x630 image, cached at the edge, from the model alone", async () => {
    lookup.mockResolvedValue(model);
    const res = await call("k7m2p9qa", "?v=23-19");
    const { element, options } = renders[0]!;
    expect(options.width).toBe(1200);
    expect(options.height).toBe(630);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=900, stale-while-revalidate=3600");
    // The card is given the model and the host and nothing else: no id, email or name can be drawn.
    expect(Object.keys(element.props).toSorted()).toEqual(["host", "model"]);
    expect(Object.keys(element.props.model as object).toSorted()).toEqual(["dayNumber", "done", "revived", "squares", "total"]);
    expect(element.props.host).toBe("90x.amanarya.com");
  });
});
