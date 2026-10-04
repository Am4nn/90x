import { expect, type Locator, type Page, test } from "@playwright/test";
import { feedCard, openFeedCard, seededCard } from "./helpers";

// Dragging is an addition to tapping. These move things with a mouse (Pointer Events,
// the same path a finger takes) and check the result is what a tap would have made.

// Both ends of a drag have to be on screen for a mouse to reach them; the default window is too short.
test.use({ viewport: { width: 1240, height: 1100 } });

/** Presses on `from`, drags in steps to `to`, and releases. */
async function drag(page: Page, from: Locator, to: Locator, dx = 0, dy = 0) {
  // Let the layout settle after the last drop before measuring.
  await page.waitForTimeout(250);
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("drag: an end of the drag is not on screen");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 10 });
  await page.mouse.up();
}

test("dragging a term onto a meaning pairs them", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "match", "match");
  await openFeedCard(page, "drag-match", card.promptMd);
  const terms = page.getByRole("list", { name: "Terms" });
  const meanings = page.getByRole("list", { name: "Meanings" });

  await drag(
    page,
    terms.getByRole("button", { name: "NullPointerException", exact: true }),
    meanings.getByRole("button", { name: "Calling into null", exact: true }),
  );
  await expect(terms.getByRole("button", { name: /NullPointerException — matched to Calling into null/ })).toBeVisible();

  // Dropping the term back among the terms undoes the pair.
  await drag(page, terms.getByRole("button", { name: /NullPointerException/ }), terms);
  await expect(terms.getByRole("button", { name: "NullPointerException", exact: true })).toBeVisible();
});

test("dragging steps into the order, reordering them and sending one back", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "order", "order");
  await openFeedCard(page, "drag-order", card.promptMd);
  const pool = page.getByRole("list", { name: "Items to place" });
  const slots = page.getByRole("list", { name: "Your order" });

  await drag(page, pool.getByRole("button", { name: "Read the cache", exact: true }), slots.getByRole("listitem").first());
  await expect(feedCard(page).getByRole("button", { name: "Remove Read the cache from the order", exact: true })).toBeVisible();

  await drag(page, pool.getByRole("button", { name: "Return the value", exact: true }), slots.getByRole("listitem").first(), 0, -10);
  await expect(slots.getByRole("listitem").first().getByRole("button")).toHaveAccessibleName("Remove Return the value from the order");

  // The grip sends a placed step back to the pool.
  const grip = slots.getByRole("listitem").first().locator("[data-grip]").first();
  await drag(page, grip, pool);
  await expect(pool.getByRole("button", { name: "Return the value", exact: true })).toBeVisible();
});

test("dragging an item into a column, and back", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "bucket", "bucket");
  await openFeedCard(page, "drag-bucket", card.promptMd);
  const items = page.getByRole("list", { name: "Items" });
  const columns = page.getByRole("list", { name: "Columns" });

  await drag(
    page,
    items.getByRole("button", { name: "upper()", exact: true }),
    columns.getByRole("button", { name: "Deterministic", exact: true }),
  );
  await expect(feedCard(page).getByRole("button", { name: "upper() — in Deterministic", exact: true })).toBeVisible();

  await drag(page, feedCard(page).getByRole("button", { name: "upper() — in Deterministic", exact: true }), items);
  await expect(items.getByRole("button", { name: "upper()", exact: true })).toBeVisible();
});

test("a drag does not also count as a tap", async ({ page }) => {
  const card = seededCard((c) => c.primitive === "bucket", "bucket");
  await openFeedCard(page, "drag-no-tap", card.promptMd);
  const items = page.getByRole("list", { name: "Items" });
  const columns = page.getByRole("list", { name: "Columns" });

  await drag(
    page,
    items.getByRole("button", { name: "now()", exact: true }),
    columns.getByRole("button", { name: "Not deterministic", exact: true }),
  );
  // Had the release also clicked the chip it would be armed (aria-pressed) and the columns would be offering "Place here".
  await expect(feedCard(page).getByRole("button", { name: "now() — in Not deterministic", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("dragging tokens into the line", async ({ page }) => {
  const card = seededCard((c) => c.archetype === "fill-code-blank", "fill-code-blank");
  await openFeedCard(page, "drag-assemble", card.promptMd);
  const pool = page.getByRole("list", { name: "Tokens" });
  const tray = feedCard(page).locator("[aria-label='Your answer']");

  await drag(page, pool.getByRole("button", { name: "SELECT", exact: true }), tray.locator("[data-drop]").first());
  await expect(feedCard(page).getByRole("button", { name: "Remove SELECT from the answer", exact: true })).toBeVisible();

  // Tapping still places the next token in the next gap.
  await pool.getByRole("button", { name: "name", exact: true }).click();
  await expect(feedCard(page).getByRole("button", { name: "Remove name from the answer", exact: true })).toBeVisible();
});
