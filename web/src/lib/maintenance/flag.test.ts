import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The flag as the app uses it, over a fake Redis: the break-glass needs no Redis at all, a save is
// seen at once on the instance that made it, and a skip says why in the logs.

const store = vi.hoisted(() => ({ value: null as unknown, gets: 0, fail: false }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async get() {
      store.gets++;
      if (store.fail) throw new Error("redis down");
      return store.value;
    }
    async set(_key: string, value: unknown) {
      store.value = value;
    }
  },
}));

const flag = () => import("./flag");

beforeEach(() => {
  vi.resetModules();
  store.value = null;
  store.gets = 0;
  store.fail = false;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("maintenance flag", () => {
  it("reads live when nothing is stored", async () => {
    const { maintenanceOn, maintenanceState } = await flag();
    expect(await maintenanceOn()).toBe(false);
    expect(await maintenanceState()).toEqual({ on: false, message: "" });
  });

  it("reads the stored switch and message", async () => {
    store.value = { on: true, message: "Back soon" };
    const { maintenanceOn, maintenanceState } = await flag();
    expect(await maintenanceOn()).toBe(true);
    expect(await maintenanceState()).toEqual({ on: true, message: "Back soon" });
  });

  it("the break-glass is on without asking Redis, even when Redis is down", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "1");
    store.fail = true;
    const { maintenanceOn } = await flag();
    expect(await maintenanceOn()).toBe(true);
    expect(store.gets).toBe(0);
  });

  it("fails open when Redis is down", async () => {
    store.fail = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { maintenanceOn } = await flag();
    expect(await maintenanceOn()).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("a save is written to Redis and seen at once on this instance, without another read", async () => {
    const { maintenanceOn, publishMaintenance } = await flag();
    expect(await maintenanceOn()).toBe(false);
    await publishMaintenance({ on: true, message: "" });
    expect(store.value).toEqual({ on: true, message: "" });
    expect(await maintenanceOn()).toBe(true);
    expect(store.gets).toBe(1);
  });

  it("a skip happens only while down, and logs the reason", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { publishMaintenance, skippedForMaintenance } = await flag();
    expect(await skippedForMaintenance("push", { tag: "morning" })).toBe(false);
    expect(log).not.toHaveBeenCalled();
    await publishMaintenance({ on: true, message: "" });
    expect(await skippedForMaintenance("push", { tag: "morning" })).toBe(true);
    expect(log).toHaveBeenCalledWith(JSON.stringify({ evt: "push.skip", reason: "maintenance", tag: "morning" }));
    log.mockRestore();
  });
});
