import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

// Company focus on Me → Plan: several companies at once, typed names become chips,
// and the choice survives a reload.

const focus = (page: Page) => page.locator("section").filter({ has: page.getByRole("heading", { name: "Company focus" }) });
const add = async (page: Page, name: string) => {
  const input = focus(page).getByLabel("Add a company");
  await input.fill(name);
  await input.press("Enter");
};

test("several companies can be picked, typed in, and survive a reload", async ({ page }) => {
  await signIn(page, "company-focus", { next: "/me/plan" });
  await expect(focus(page)).toContainText("No company focus. Pick any to boost their problems.");
  await expect(focus(page)).toContainText("0 of 10");

  await add(page, "Zeta Corp");
  await add(page, "acme labs");
  await add(page, "ZETA CORP"); // the same name again: no second chip
  await add(page, "Northwind");
  await expect(focus(page)).toContainText("Focusing on Zeta Corp, acme labs, Northwind until");
  await expect(focus(page)).toContainText("3 of 10 · Saved");

  await focus(page).getByRole("button", { name: "2 weeks" }).click();
  await expect(focus(page)).toContainText("Saving…");
  await expect(focus(page)).toContainText("3 of 10 · Saved");

  await page.reload();
  await expect(focus(page)).toContainText("Focusing on Zeta Corp, acme labs, Northwind until");
  for (const name of ["Remove Zeta Corp", "Remove acme labs", "Remove Northwind"]) {
    await expect(focus(page).getByRole("button", { name })).toBeVisible();
  }
  await expect(focus(page).getByRole("button", { name: "2 weeks" })).toHaveAttribute("aria-pressed", "true");

  // A typed chip is removed by clicking it.
  await focus(page).getByRole("button", { name: "Remove acme labs" }).click();
  await expect(focus(page)).toContainText("Focusing on Zeta Corp, Northwind until");
  await expect(focus(page)).toContainText("2 of 10 · Saved");
});

test("ten picked locks the rest", async ({ page }) => {
  await signIn(page, "company-ten", { next: "/me/plan" });
  for (let i = 1; i <= 10; i++) await add(page, `Firm ${i}`);
  await expect(focus(page)).toContainText("10 of 10");
  const input = focus(page).getByLabel("Add a company");
  await expect(input).toBeDisabled();
  await expect(input).toHaveAttribute("placeholder", "Ten picked. Remove one to add another.");

  await focus(page).getByRole("button", { name: "Remove Firm 10" }).click();
  await expect(input).toBeEnabled();
});
