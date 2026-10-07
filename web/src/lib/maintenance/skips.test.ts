import { beforeEach, describe, expect, it, vi } from "vitest";

// While the app is down, background work does not run: scheduled jobs answer 200 without running
// (so QStash does not retry), and AI refuses everyone but admins. Each logs the maintenance reason.

vi.mock("server-only", () => ({}));
const on = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/maintenance/flag", () => ({
  maintenanceOn: async () => on.value,
  skippedForMaintenance: async (what: string, detail: Record<string, unknown> = {}) => {
    if (on.value) console.log(JSON.stringify({ evt: `${what}.skip`, reason: "maintenance", ...detail }));
    return on.value;
  },
}));
vi.mock("@upstash/qstash", () => ({
  Receiver: class {
    verify = async () => true;
  },
}));
const admins = vi.hoisted(() => new Set<string>());
const settings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/settings", () => ({ getSettings: settings }));
vi.mock("@/lib/ai/usage", () => ({ readSpend: async () => ({ day: 0, month: 0, userDay: 0, lifetime: 0 }) }));
vi.mock("@/db/schema", () => ({ userApprovals: { userId: "user_id", status: "status", isAdmin: "is_admin" } }));
vi.mock("drizzle-orm", () => ({ and: (...a: unknown[]) => a, eq: (_c: unknown, v: unknown) => v }));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (conds: unknown[]) => ({ limit: async () => (admins.has(String(conds[0])) ? [{ id: conds[0] }] : []) }),
      }),
    }),
  },
}));

const { qstashJob } = await import("@/lib/upstash/qstash");
const { aiGate } = await import("@/lib/ai/guard");
const { DEFAULT_SETTINGS } = await import("@/lib/settings-rules");

const signed = () =>
  new Request("https://90x.test/api/jobs/hourly", { method: "POST", headers: { "upstash-signature": "sig" }, body: "{}" });

beforeEach(() => {
  on.value = false;
  admins.clear();
  settings.mockResolvedValue(DEFAULT_SETTINGS);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://90x.test");
});

describe("scheduled jobs in maintenance", () => {
  it("run while live", async () => {
    const run = vi.fn(async () => ({ done: 1 }));
    const res = await qstashJob("/api/jobs/hourly", run)(signed());
    expect(await res.json()).toEqual({ done: 1 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("are skipped while down, answering 200 so QStash does not retry, with the reason logged", async () => {
    on.value = true;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const run = vi.fn(async () => ({ done: 1 }));
    const res = await qstashJob("/api/jobs/hourly", run)(signed());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: "maintenance" });
    expect(run).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(JSON.stringify({ evt: "job.skip", reason: "maintenance", path: "/api/jobs/hourly" }));
    log.mockRestore();
  });
});

describe("aiGate in maintenance", () => {
  it("lets a call through while live", async () => {
    expect(await aiGate("member")).toEqual({ allowed: true, degrade: false });
  });

  it("refuses anyone but an admin while down, and logs why", async () => {
    on.value = true;
    admins.add("admin");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await aiGate("member")).toEqual({ allowed: false, reason: "maintenance" });
    expect(log).toHaveBeenCalledWith(JSON.stringify({ evt: "ai.skip", reason: "maintenance" }));
    expect(await aiGate("admin")).toEqual({ allowed: true, degrade: false });
    log.mockRestore();
  });

  it("does not refuse the Coach's model choice, which has no person", async () => {
    on.value = true;
    expect((await aiGate()).allowed).toBe(true);
  });

  it("refuses admins too under the break-glass, before any lookup", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "1");
    admins.add("admin");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await aiGate("admin")).toEqual({ allowed: false, reason: "maintenance" });
    expect(await aiGate()).toEqual({ allowed: false, reason: "maintenance" });
    log.mockRestore();
    vi.unstubAllEnvs();
  });
});
