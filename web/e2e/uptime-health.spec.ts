import { expect, test } from "@playwright/test";

test("the health endpoint answers ok when signed out", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  // Outside Vercel the deploy variables are unset, so the version is all null.
  expect(await res.json()).toEqual({
    ok: true,
    checks: { database: "up", redis: "up" },
    maintenance: false,
    version: { commit: null, branch: null, region: null },
  });
});
