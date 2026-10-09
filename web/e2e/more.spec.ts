import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { gotoToday, missions, signIn } from "./helpers";

// Extras: "+ Add a problem" is always on Today, an added problem lands under Extras (never in Missions),
// the day's count does not move, and × removes it. Extras from an earlier day carry over.

const extrasList = (page: Parameters<typeof gotoToday>[0]) => page.getByRole("list", { name: "Extras" });
const dayCount = (page: Parameters<typeof gotoToday>[0]) => page.getByText(/^\d+ of \d+ done$/);
const addButton = (page: Parameters<typeof gotoToday>[0]) => page.getByRole("button", { name: "Add a problem", exact: true });

test('"+ Add a problem" works on a day that is not done, lands under Extras, and × removes it', async ({ page }) => {
  await signIn(page, "extras");
  await gotoToday(page);
  const before = await dayCount(page).innerText();
  const planned = await missions(page).getByRole("listitem").count();

  // No extras yet: no Extras heading or list, only the add line.
  await expect(page.getByRole("heading", { name: "Extras", exact: true })).toHaveCount(0);
  await expect(extrasList(page)).toHaveCount(0);

  await addButton(page).click();
  await expect(extrasList(page).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Extras", exact: true })).toBeVisible();
  await expect(page.getByText("1 open", { exact: true })).toBeVisible();
  const row = extrasList(page).getByRole("listitem").first();
  await expect(row.getByRole("link")).toHaveAttribute("href", /^\/library\/problem\//);
  await expect(row).toContainText("added today");

  // Bonus work: the day's count and the Missions list are untouched.
  await expect(dayCount(page)).toHaveText(before);
  await expect(missions(page).getByRole("listitem")).toHaveCount(planned);

  // A second add picks a different problem.
  await addButton(page).click();
  await expect(extrasList(page).getByRole("listitem")).toHaveCount(2);
  const hrefs = await extrasList(page)
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  expect(new Set(hrefs).size).toBe(2);

  await extrasList(page).getByRole("button", { name: "Remove" }).first().click();
  await expect(extrasList(page).getByRole("listitem")).toHaveCount(1);
  await extrasList(page).getByRole("button", { name: "Remove" }).click();
  await expect(extrasList(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Extras", exact: true })).toHaveCount(0);
  await expect(addButton(page)).toBeVisible();
  await expect(dayCount(page)).toHaveText(before);
});

test("more than three extras fold behind Show all", async ({ page }) => {
  await signIn(page, "extras-fold");
  await gotoToday(page);
  for (let i = 1; i <= 4; i++) {
    await addButton(page).click();
    await expect(page.getByText(`${i} open`, { exact: true })).toBeVisible();
  }
  const items = extrasList(page).getByRole("listitem");
  // Three rows and the fold row.
  await expect(items).toHaveCount(4);
  await page.getByRole("button", { name: "Show all 4", exact: true }).click();
  await expect(items).toHaveCount(5);
  await page.getByRole("button", { name: "Show fewer", exact: true }).click();
  await expect(items).toHaveCount(4);
});

const url = process.env.DATABASE_URL ?? "";
const local = /@(127\.0\.0\.1|localhost)[:/]/.test(url);

test("an extra added on an earlier day is still there, saying when it was added", async ({ page }) => {
  test.skip(!local, "writes a missions row, so it runs only against the local database");
  const db = postgres(url, { max: 1, prepare: false });
  try {
    // Off Today first: opening it would plan, and the extra has to predate that.
    const name = "extras-carried";
    await signIn(page, name, { missed: true, next: "/me" });
    const [user] = await db<{ id: string }[]>`
      select id from auth.users where email like ${`${name}-%@e2e.test`} order by created_at desc limit 1`;
    // The least important problem, which the planner will not pick for today.
    const [problem] = await db<{ slug: string; title: string }[]>`
      select slug, title from public.problems where kind = 'leetcode' and not hidden order by importance asc nulls first limit 1`;
    expect(user && problem).toBeTruthy();
    await db`insert into public.missions (user_id, date, slot_type, ref, est_minutes, reason, is_extra)
             values (${user!.id}, current_date - 2, 'new_problem', ${problem!.slug}, 40, 'Carried test', true)`;
    await gotoToday(page);
    const row = extrasList(page)
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: problem!.title, exact: true }) });
    await expect(row).toContainText(/Carried test · added (Sun|Mon|Tue|Wed|Thu|Fri|Sat)(?![a-z])/);
    // Not counted in Missions.
    await expect(missions(page).getByRole("link", { name: problem!.title, exact: true })).toHaveCount(0);
  } finally {
    await db.end();
  }
});
