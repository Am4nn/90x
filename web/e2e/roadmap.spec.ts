import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

const view = (page: Page) => page.getByRole("navigation", { name: "View" });

test("a non-DSA area shows the toggle and opens on List", async ({ page }) => {
  await signIn(page, "roadmap", { next: "/library?area=system_design" });
  await expect(view(page)).toBeVisible();
  await expect(view(page).getByRole("link", { name: "List" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Roadmap", exact: true })).toBeVisible();
});

test("Roadmap renders the graph, keeps ?view=roadmap on reload, and links only real lessons", async ({ page }) => {
  await signIn(page, "roadmap", { next: "/library?area=system_design" });
  await view(page).getByRole("link", { name: "Roadmap" }).click();
  await expect(page).toHaveURL(/view=roadmap/);
  const graph = page.getByRole("region", { name: /roadmap$/ }).first();
  await expect(graph).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/view=roadmap/);
  await expect(view(page).getByRole("link", { name: "Roadmap" })).toHaveAttribute("aria-current", "page");
  await expect(graph).toBeVisible();

  const lesson = graph.locator('a[href^="/library/topic/"]').first();
  await expect(lesson).toBeVisible();
  const href = await lesson.getAttribute("href");
  await lesson.click();
  await expect(page).toHaveURL(href ?? "");

  await page.goBack();
  const soon = page.getByText("soon", { exact: true }).first();
  if (await soon.count()) {
    const row = soon.locator("xpath=..");
    await expect(row.getByRole("link")).toHaveCount(0);
    await expect(row.getByRole("button")).toBeVisible();
  }
});

test("a tick made in the Roadmap view survives a reload", async ({ page }) => {
  await signIn(page, "roadmap", { next: "/library?area=system_design&view=roadmap" });
  const tick = page.getByRole("button", { name: /^Mark .* as covered$/ }).first();
  const name = (await tick.getAttribute("aria-label")) ?? "";
  const ticked = (p: Page) => p.getByRole("button", { name: name.replace("as covered", "as not covered") });

  await tick.click();
  await expect(ticked(page)).toHaveAttribute("aria-pressed", "true");

  // Persistence is checked from a second page rather than by reloading this one. The
  // tick is optimistic and the write is still in flight: reloading here cancels the
  // action's own request, so the tick is lost and no amount of reloading finds it again.
  // Watching the network instead does not help either - the response headers arrive
  // before the write lands, and a server action's streamed body does not reliably close,
  // so waiting on either is a coin toss. A second page shares the session, disturbs
  // nothing, and can be retried until the write shows up.
  const other = await page.context().newPage();
  await expect(async () => {
    await other.goto("/library?area=system_design&view=roadmap");
    await expect(ticked(other)).toHaveAttribute("aria-pressed", "true");
  }).toPass({ timeout: 15_000 });
  await other.close();
});

test("DSA has no toggle and keeps its Pattern Map", async ({ page }) => {
  await signIn(page, "roadmap", { next: "/library?area=dsa" });
  await expect(view(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Patterns" })).toBeVisible();
});
