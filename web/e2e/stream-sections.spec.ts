import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Today, Coach and Me stream: the header goes out first and each slow section
// fills in behind its own skeleton. These check that every section still lands.

test("Today streams its sections in behind the header", async ({ page }) => {
  await signIn(page, "stream-today");
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Missions" })).toBeVisible();
  await expect(page.getByText(/^Day 1 · /)).toBeVisible();
});

test("Coach streams its list and chat in behind the header", async ({ page }) => {
  await signIn(page, "stream-coach", { next: "/coach" });
  await expect(page.getByRole("heading", { level: 1, name: "Coach" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Coach modes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
});

test("Me streams its sections in behind the header", async ({ page }) => {
  await signIn(page, "stream-me", { next: "/me" });
  await expect(page.getByRole("heading", { level: 1, name: "Me" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weakest patterns" })).toBeVisible();
});
