import { randomUUID } from "node:crypto";
import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

// /admin/users: Block, Unblock and Delete with a typed email. The admin and the person are two browser
// contexts, so what the person sees is what a real block does to a real session.

/** The rows of one section ("Active", "Blocked", ...) whose text has `text`. */
const row = (page: Page, section: string, text: string) =>
  page
    .getByRole("heading", { name: new RegExp(`^${section}`) })
    .locator("xpath=ancestor::section")
    .getByRole("listitem")
    .filter({ hasText: text });

/**
 * Click a row button that opens a confirm, until the confirm shows. A click that lands before the
 * page hydrates does nothing (the local DB has thousands of rows, so hydration takes a while).
 */
async function openConfirm(button: Locator, confirm: Locator) {
  await expect(async () => {
    if (await button.isVisible()) await button.click({ timeout: 5000 });
    await expect(confirm).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 150_000 });
}

/** The app's one date style: "Oct 3". */
const DAY = String.raw`[A-Z][a-z]{2} \d{1,2}`;

/** Sign a new person in (second context), with an email the spec knows. */
async function newMember(browser: Browser, admin: Page, name: string, asAdmin = false) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `${name}-${randomUUID().slice(0, 8)}@e2e.test`;
  const params = new URLSearchParams({ email, next: "/today" });
  if (asAdmin) params.set("admin", "1");
  await page.goto(`/api/test/sign-in?${params}`);
  await expect(page).toHaveURL(/\/today/);
  await admin.goto("/admin/users");
  return { context, page, email };
}

test("an admin deletes a person by typing their email, and the row lands under Deleted", async ({ page, browser }) => {
  await signIn(page, "admin-del", { admin: true, next: "/admin/users" });
  const { context, email } = await newMember(browser, page, "doomed");
  try {
    await openConfirm(row(page, "Active", email).getByRole("button", { name: "Delete…" }), page.getByLabel("Type their email to confirm."));
    // Focus moves into the confirm.
    await expect(page.getByLabel("Type their email to confirm.")).toBeFocused();
    await page.getByLabel("Type their email to confirm.").fill(email);
    await page.getByRole("button", { name: "Delete everything" }).click();
    await expect(row(page, "Active", email)).toHaveCount(0);
    const deleted = row(page, "Deleted", email);
    await expect(deleted).toBeVisible();
    await expect(deleted).toContainText(new RegExp(`Deleted by an admin · ${DAY} · signed up ${DAY}`));
  } finally {
    await context.close();
  }
});

test("a wrong typed email is refused and nothing is deleted", async ({ page, browser }) => {
  await signIn(page, "admin-wrong", { admin: true, next: "/admin/users" });
  const { context, email } = await newMember(browser, page, "spared");
  try {
    await openConfirm(row(page, "Active", email).getByRole("button", { name: "Delete…" }), page.getByLabel("Type their email to confirm."));
    await page.getByLabel("Type their email to confirm.").fill("someone-else@e2e.test");
    await page.getByRole("button", { name: "Delete everything" }).click();
    await expect(page.locator("form [role=alert]")).toContainText("doesn't match");
    // Cancel returns focus to the Delete… button that opened the confirm.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(row(page, "Active", email).getByRole("button", { name: "Delete…" })).toBeFocused();
    await page.reload();
    await expect(row(page, "Active", email)).toBeVisible();
    await expect(row(page, "Deleted", email)).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("Block shuts a person out and Unblock lets them back to Today", async ({ page, browser }) => {
  await signIn(page, "admin-block", { admin: true, next: "/admin/users" });
  const { context, page: member, email } = await newMember(browser, page, "blockee");
  try {
    await openConfirm(
      row(page, "Active", email).getByRole("button", { name: "Block", exact: true }),
      page.getByText(/They can still sign in but can.t use 90x/),
    );
    await page
      .getByRole("group", { name: /^Block / })
      .getByRole("button", { name: "Block", exact: true })
      .click();
    await expect(row(page, "Blocked", email)).toBeVisible();
    await expect(row(page, "Blocked", email)).toContainText(new RegExp(`signed up ${DAY} · blocked ${DAY}`));

    await member.goto("/today");
    await expect(member).toHaveURL(/\/pending/);

    await row(page, "Blocked", email).getByRole("button", { name: "Unblock" }).click();
    await expect(row(page, "Active", email)).toBeVisible();

    await member.goto("/today");
    await expect(member).toHaveURL(/\/today/);
  } finally {
    await context.close();
  }
});

test("another admin's row offers neither Block nor Delete", async ({ page, browser }) => {
  await signIn(page, "admin-peer", { admin: true, next: "/admin/users" });
  const { context, email } = await newMember(browser, page, "peer", true);
  try {
    const peer = row(page, "Active", email);
    await expect(peer).toContainText(new RegExp(`${email} · admin · signed up ${DAY}`));
    await expect(peer.getByRole("button")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("a row's Block button is a full touch target on a phone", { tag: "@mobile" }, async ({ page, browser }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 640, "44px applies below the sm breakpoint");
  await signIn(page, "admin-touch", { admin: true, next: "/admin/users" });
  const { context, email } = await newMember(browser, page, "touch");
  try {
    const box = await row(page, "Active", email).getByRole("button", { name: "Block", exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  } finally {
    await context.close();
  }
});
