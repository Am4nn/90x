import { expect, test } from "@playwright/test";

test("the health endpoint answers ok when signed out", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
