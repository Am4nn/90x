import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./helpers";

// /admin/reports lists the topics Coach noted the Library lacks, and Clear removes one. The row is
// seeded over the database connection, as the note_library_gap tool does through noteLibraryGap.

const url = process.env.DATABASE_URL ?? "";
const local = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
test.skip(!local, "writes a library_gaps row, so it runs only against the local database");

const db = local ? postgres(url, { max: 1, prepare: false }) : null;
test.afterAll(async () => {
  await db?.end();
});

test("an admin sees a topic the Library lacks, then clears it", async ({ page }) => {
  const topic = `e2e topic ${randomUUID().slice(0, 8)}`;
  await db!`insert into public.library_gaps (topic, asks) values (${topic}, 3)`;
  try {
    await signIn(page, "admin-gaps", { admin: true, next: "/admin/reports" });
    await expect(page.getByRole("heading", { name: "Topics the Library doesn't cover" })).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: topic });
    await expect(row).toContainText("3 asks");
    // A click before the page hydrates does nothing, so retry until the row goes.
    await expect(async () => {
      if (await row.isVisible()) await row.getByRole("button", { name: "Clear" }).click({ timeout: 5000 });
      await expect(row).toHaveCount(0, { timeout: 5000 });
    }).toPass({ timeout: 60_000 });
    const left = await db!`select 1 from public.library_gaps where topic = ${topic}`;
    expect(left).toHaveLength(0);
  } finally {
    await db!`delete from public.library_gaps where topic = ${topic}`;
  }
});
