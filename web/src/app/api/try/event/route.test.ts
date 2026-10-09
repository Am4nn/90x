import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ tryEvents: {} }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/maintenance/flag", () => ({ maintenanceOn: vi.fn() }));
vi.mock("@/lib/upstash/rate-limit", () => ({ takeTryEventSlot: vi.fn() }));
vi.mock("@/lib/try/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/try/events")>()),
  insertTryEvent: vi.fn(),
}));

import { logError } from "@/lib/log";
import { maintenanceOn } from "@/lib/maintenance/flag";
import { insertTryEvent } from "@/lib/try/events";
import { takeTryEventSlot } from "@/lib/upstash/rate-limit";
import { POST } from "./route";

const GOOD = { visit: "k7m2p9qa0z1x2c3v4b5n6m7q", kind: "answer", data: { card: "sd", option: 2, correct: true } };

const post = (body: string, headers: Record<string, string> = {}) =>
  POST(new NextRequest("http://x/api/try/event", { method: "POST", body, headers: { "Content-Type": "application/json", ...headers } }));

function expectQuiet204(res: Response) {
  expect(res.status).toBe(204);
  expect(res.headers.get("Cache-Control")).toBe("no-store");
}

function expectDropped() {
  expect(vi.mocked(takeTryEventSlot)).not.toHaveBeenCalled();
  expect(vi.mocked(insertTryEvent)).not.toHaveBeenCalled();
}

describe("POST /api/try/event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(maintenanceOn).mockResolvedValue(false);
    vi.mocked(takeTryEventSlot).mockResolvedValue(true);
    vi.mocked(insertTryEvent).mockResolvedValue(undefined);
  });

  it("stores a good event, metered by the first forwarded address", async () => {
    const res = await post(JSON.stringify(GOOD), { "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" });
    expectQuiet204(res);
    expect(vi.mocked(takeTryEventSlot)).toHaveBeenCalledExactlyOnceWith("203.0.113.9");
    expect(vi.mocked(insertTryEvent)).toHaveBeenCalledExactlyOnceWith(GOOD);
  });

  it("drops a bad body without metering or storing it", async () => {
    expectQuiet204(await post(JSON.stringify({ ...GOOD, kind: "purchase" })));
    expectQuiet204(await post("not json"));
    expectDropped();
  });

  it("drops a body that says it is over 2 KB before reading it", async () => {
    expectQuiet204(await post(JSON.stringify(GOOD), { "content-length": "4096" }));
    expectDropped();
  });

  it("drops a body over 2 KB that did not say so", async () => {
    const padded = JSON.stringify(GOOD) + " ".repeat(2100);
    expectQuiet204(await post(padded));
    expectDropped();
  });

  it("drops every event while the admin maintenance switch is on", async () => {
    vi.mocked(maintenanceOn).mockResolvedValue(true);
    expectQuiet204(await post(JSON.stringify(GOOD)));
    expectDropped();
  });

  it("drops the event when the address is over its allowance (or the meter is down)", async () => {
    vi.mocked(takeTryEventSlot).mockResolvedValue(false);
    expectQuiet204(await post(JSON.stringify(GOOD)));
    expect(vi.mocked(takeTryEventSlot)).toHaveBeenCalledExactlyOnceWith("unknown");
    expect(vi.mocked(insertTryEvent)).not.toHaveBeenCalled();
  });

  it("answers 204 and logs when the insert fails", async () => {
    vi.mocked(insertTryEvent).mockRejectedValueOnce(new Error("db down"));
    expectQuiet204(await post(JSON.stringify(GOOD)));
    expect(vi.mocked(logError)).toHaveBeenCalledOnce();
  });
});
