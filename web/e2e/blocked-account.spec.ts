import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./helpers";

// An account an admin blocked can still sign in but lands on /pending with the blocked copy and a
// way to sign out. The status is set over the database connection, as the admin's Block button does.

const url = process.env.DATABASE_URL ?? "";
const local = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
test.skip(!local, "writes a user_approvals row, so it runs only against the local database");

const db = local ? postgres(url, { max: 1, prepare: false }) : null;
test.afterAll(async () => {
  await db?.end();
});

test("a blocked account sees that it can't use 90x, and can sign out", async ({ page }) => {
  await signIn(page, "blocked-account");
  await db!`update public.user_approvals set status = 'rejected'
            where user_id in (select id from auth.users where email like 'blocked-account-%@e2e.test')`;
  await page.goto("/today");
  await expect(page).toHaveURL(/\/pending$/);
  await expect(page.getByRole("heading", { name: "This account can't use 90x" })).toBeVisible();
  await expect(page.getByText("If you think this is a mistake, email")).toBeVisible();
  await expect(page).toHaveTitle(/This account can't use 90x/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });
});

test("a blocked account can delete itself from the blocked screen", async ({ page }) => {
  await signIn(page, "blocked-delete");
  await db!`update public.user_approvals set status = 'rejected'
            where user_id in (select id from auth.users where email like 'blocked-delete-%@e2e.test')`;
  await page.goto("/today");
  await expect(page).toHaveURL(/\/pending$/);
  await page.getByRole("button", { name: "Delete my account…" }).click();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page).toHaveURL("/?deleted=1", { timeout: 30_000 });
});
