import { describe, expect, it } from "vitest";
import { DEFAULT_POOL_MAX, poolOptions } from "./pool";

describe("poolOptions", () => {
  it("defaults to a small pool", () => {
    expect(poolOptions({})).toEqual({ max: DEFAULT_POOL_MAX, idle_timeout: 20, connect_timeout: 10 });
    expect(DEFAULT_POOL_MAX).toBe(5);
  });

  it("takes DB_POOL_MAX when it is a positive whole number", () => {
    expect(poolOptions({ DB_POOL_MAX: "3" }).max).toBe(3);
  });

  it("ignores a DB_POOL_MAX that is not a positive whole number", () => {
    for (const bad of ["", "0", "-2", "2.5", "lots"]) expect(poolOptions({ DB_POOL_MAX: bad }).max).toBe(DEFAULT_POOL_MAX);
  });
});
