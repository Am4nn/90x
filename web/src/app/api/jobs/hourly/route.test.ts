import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinishedRun, RunStore } from "@/lib/jobs/record";

// The hourly route through the real qstashJob and the real recorder, with everything it reaches mocked:
// the order of the work, the runs it records, the 200 a partly failed tick still answers (a 500 would make
// QStash retry and resend every morning push) and the 401 an unsigned call gets before anything is written.

const h = vi.hoisted(() => ({
  calls: [] as string[],
  signed: true,
  jobs: [] as { userId: string; kind: string }[],
  started: [] as string[],
  finished: [] as FinishedRun[],
  failRollover: false,
  failPrune: false,
  failPurge: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@upstash/qstash", () => ({
  Receiver: class {
    async verify() {
      return h.signed;
    }
  },
}));
vi.mock("@/db", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    where: async () => {
      h.calls.push("users");
      return ["u1", "u2", "u3"].map((userId) => ({ userId, timezone: "UTC", morningHour: 8, notifications: {} }));
    },
  };
  return { db: chain };
});
vi.mock("@/lib/tracker/notify", () => ({
  dueJobs: () => h.jobs,
  morningText: () => ({ title: "Plan", body: "today" }),
  eveningText: () => ({ title: "Left", body: "tonight" }),
}));
vi.mock("@/lib/tracker/service", () => ({
  ensureToday: async (userId: string) => {
    h.calls.push(`today ${userId}`);
    if (h.failRollover && userId === "u3") throw new Error("deadlock detected");
    return { state: "active", streak: 1, missions: [{ status: "open", isRevive: false, isExtra: false, estMinutes: 10 }] };
  },
  snapshotReadiness: async (userId: string) => void h.calls.push(`snapshot ${userId}`),
}));
vi.mock("@/lib/push", () => ({
  pushEnabled: () => true,
  settingsOf: () => ({ evening: true, friends: true, weekly: true }),
  sendToUser: async (userId: string) => void h.calls.push(`push ${userId}`),
}));
vi.mock("@/lib/coach/weekly", () => ({
  generateWeeklyReview: async (userId: string) => {
    h.calls.push(`weekly ${userId}`);
    return "review-id";
  },
}));
vi.mock("@/lib/feed/flag-service", () => ({
  hideStaleCards: async () => {
    h.calls.push("sweep");
    return 2;
  },
}));
vi.mock("@/lib/jobs/store", async () => {
  const { recordRun } = await import("@/lib/jobs/record");
  const store: RunStore = {
    async start(job) {
      h.started.push(job);
      return h.started.length;
    },
    async finish(run) {
      h.finished.push(run);
    },
  };
  return {
    recordJob: (job: string, run: () => Promise<unknown>, judge?: never) => recordRun(job, run, { store, judge }),
    pruneJobRuns: async () => {
      h.calls.push("prune");
      if (h.failPrune) throw new Error("prune broke");
      return 0;
    },
  };
});

vi.mock("@/lib/account/deleted", () => ({
  purgeDeletedAccounts: async (now: Date) => {
    h.calls.push(`purge ${now.toISOString()}`);
    if (h.failPurge) throw new Error("purge broke");
    return 0;
  },
}));

const { POST } = await import("./route");
const call = () =>
  POST(new Request("https://90x.test/api/jobs/hourly", { method: "POST", body: "", headers: { "upstash-signature": "sig" } }));

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://90x.test";
  Object.assign(h, { calls: [], signed: true, started: [], finished: [], failRollover: false, failPrune: false, failPurge: false });
  h.jobs = [
    { userId: "u1", kind: "weekly" },
    { userId: "u2", kind: "morning" },
    { userId: "u3", kind: "rollover" },
  ];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T00:05:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/jobs/hourly", () => {
  it("does the pushes first, then weekly reviews, the 00 UTC sweep, the prune and the purge, recording three runs", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.calls).toEqual([
      "users",
      "today u2",
      "push u2",
      "today u3",
      "snapshot u3",
      "weekly u1",
      "sweep",
      "prune",
      "purge 2026-10-08T00:05:00.000Z",
    ]);
    expect(h.started).toEqual(["hourly", "weekly-reviews", "stale-sweep"]);
    expect(h.finished.map((r) => [r.job, r.status])).toEqual([
      ["weekly-reviews", "ok"],
      ["stale-sweep", "ok"],
      ["hourly", "ok"],
    ]);
    expect(await res.json()).toEqual({ users: 3, due: 3, ok: { morning: 1, rollover: 1, weekly: 1 }, failed: {}, sweep: "ok" });
  });

  it("still answers 200 when part of the tick failed, and records the run as failed", async () => {
    h.failRollover = true;
    const res = await call();
    expect(res.status).toBe(200);
    const hourly = h.finished.find((r) => r.job === "hourly");
    expect(hourly).toMatchObject({ status: "failed", error: "1 of 3 due failed (rollover)" });
  });

  it("is not failed by a prune that throws", async () => {
    h.failPrune = true;
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.finished.find((r) => r.job === "hourly")?.status).toBe("ok");
  });

  it("is not failed by a deleted-accounts purge that throws, and purges every hour", async () => {
    h.failPurge = true;
    vi.setSystemTime(new Date("2026-10-08T05:05:00Z"));
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.calls).toContain("purge 2026-10-08T05:05:00.000Z");
    expect(h.finished.find((r) => r.job === "hourly")?.status).toBe("ok");
  });

  it("skips the sweep outside 00 UTC and records no weekly run when none is due", async () => {
    vi.setSystemTime(new Date("2026-10-08T05:05:00Z"));
    h.jobs = [{ userId: "u2", kind: "morning" }];
    await call();
    expect(h.calls).not.toContain("sweep");
    expect(h.started).toEqual(["hourly"]);
  });

  it("answers 401 to an unsigned call before reading users or writing a run", async () => {
    h.signed = false;
    const res = await call();
    expect(res.status).toBe(401);
    expect(h.calls).toEqual([]);
    expect(h.started).toEqual([]);
    expect(h.finished).toEqual([]);
  });
});
