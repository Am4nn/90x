import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException }));

const { todayStats } = await import("./service");

/**
 * A stand-in for the Drizzle client: every builder call chains, and awaiting
 * the chain resolves to `rows`. Queries that join (only readiness's do)
 * reject instead, like the statement timeout Sentry caught on /today.
 */
function fakeDb(rows: unknown[], joinError: Error) {
  const chain = (failing: boolean): unknown =>
    new Proxy(() => {}, {
      get(_, prop) {
        if (prop === "then") {
          const result = failing ? Promise.reject(joinError) : Promise.resolve(rows);
          return result.then.bind(result);
        }
        return () => chain(failing || prop === "innerJoin");
      },
    });
  return chain(false) as Parameters<typeof todayStats>[2];
}

describe("todayStats", () => {
  beforeEach(() => captureException.mockClear());

  it("still returns solved and reviews due when readiness fails, and reports the error", async () => {
    const timeout = new Error("canceling statement due to statement timeout");
    const stats = await todayStats("user-1", "2026-09-27", fakeDb([{ n: 3 }], timeout));
    expect(stats).toEqual({ readiness: null, solved: 3, reviewsDue: 3 });
    expect(captureException).toHaveBeenCalledWith(timeout);
  });
});
