// Checks the public share-code lookup against the real database. Everything runs in one
// transaction that is always rolled back. Run with `bun run check:share`.

import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { shareCodes } from "@/db/schema";
import { cardModelForCode, getOrCreateShareCode } from "@/lib/share/service";
import { addDays, localDate } from "@/lib/tracker/dates";

// This check writes (then rolls back) rows: never let it near a real database.
for (const url of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
  if (!url || !/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    console.error("check-share runs only against a local database (127.0.0.1 or localhost).");
    process.exit(1);
  }
}

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const [owner, other, pending, rejected, ended] = [
  "00000000-0000-4000-8000-0000000000a1", // approved, active campaign
  "00000000-0000-4000-8000-0000000000a2", // approved, same dates, other statuses
  "00000000-0000-4000-8000-0000000000a3", // pending
  "00000000-0000-4000-8000-0000000000a4", // rejected
  "00000000-0000-4000-8000-0000000000a5", // approved, campaign ended
] as const;
const status = { [owner]: "approved", [other]: "approved", [pending]: "pending", [rejected]: "rejected", [ended]: "approved" };

const ROLLBACK = new Error("rollback");

try {
  await db.transaction(async (tx) => {
    for (const id of [owner, other, pending, rejected, ended]) {
      await tx.execute(
        sql`insert into auth.users (id, email, aud, role, raw_user_meta_data)
            values (${id}, ${`share-${id.slice(-2)}@example.test`}, 'authenticated', 'authenticated', '{"full_name": "Test"}'::jsonb)`,
      );
      // The sign-up trigger made a pending row; decide it the way the admin would.
      if (status[id] === "approved")
        await tx.execute(sql`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${id}`);
      if (status[id] === "rejected")
        await tx.execute(sql`update public.user_approvals set status = 'rejected', decided_at = now() where user_id = ${id}`);
      await tx.execute(sql`update public.profiles set timezone = 'UTC' where user_id = ${id}`);
    }

    const start = addDays(localDate("UTC"), -3);
    const seed = async (userId: string, campaignStatus: string, statuses: string[], from = 0) => {
      const res = await tx.execute<{ id: string }>(
        sql`insert into public.campaigns (user_id, start_date, length_days, status, templates)
            values (${userId}, ${start}, 30, ${campaignStatus}, '{}'::jsonb) returning id`,
      );
      const id = res[0]?.id;
      if (!id) throw new Error("campaign not created");
      for (const [i, s] of statuses.entries()) {
        await tx.execute(
          sql`insert into public.days (user_id, date, campaign_id, status) values (${userId}, ${addDays(start, from + i)}, ${id}, ${s})`,
        );
      }
      return id;
    };
    // Rows the card must not count. days is keyed by (user, date), so these sit on dates the owner's
    // active campaign has no row for: an older campaign of the same user (a dropped campaign_id
    // filter would count it) and another user's row carrying the owner's campaign id (a dropped
    // user_id filter would count it).
    await seed(owner, "ended", ["done"], 3);
    const ownerCampaign = await seed(owner, "active", ["done", "done", "revived"]);
    await tx.execute(
      sql`insert into public.days (user_id, date, campaign_id, status) values (${other}, ${addDays(start, 5)}, ${ownerCampaign}, 'done')`,
    );
    await seed(other, "active", ["missed", "missed", "missed"]);
    await seed(pending, "active", ["done", "done", "done"]);
    await seed(rejected, "active", ["done", "done", "done"]);
    await seed(ended, "ended", ["done", "done", "done"]);

    const codes = new Map<string, string>();
    for (const id of [owner, other, pending, rejected, ended]) codes.set(id, await getOrCreateShareCode(id, tx));
    const code = (id: string) => codes.get(id) ?? "";

    const model = await cardModelForCode(code(owner), tx);
    expect("an approved owner's code gives their card", model !== null);
    expect(
      "the card counts only that owner's days",
      model?.done === 2 && model.revived === 1,
      `done ${model?.done}, revived ${model?.revived}`,
    );
    expect("the card is on day 4 of 30", model?.dayNumber === 4 && model.total === 30);
    const otherModel = await cardModelForCode(code(other), tx);
    expect("another user with the same dates has their own card", otherModel?.done === 0 && otherModel.revived === 0);

    expect("a pending owner gives null", (await cardModelForCode(code(pending), tx)) === null);
    expect("a rejected owner gives null", (await cardModelForCode(code(rejected), tx)) === null);
    expect("an owner whose campaign ended gives null", (await cardModelForCode(code(ended), tx)) === null);
    expect("an unknown well-formed code gives null", (await cardModelForCode("zzzzzzzz", tx)) === null);
    expect("a malformed code gives null", (await cardModelForCode("../x", tx)) === null);

    const again = await getOrCreateShareCode(owner, tx);
    const [rows] = await tx.select({ n: count() }).from(shareCodes).where(eq(shareCodes.userId, owner));
    expect("a second call returns the same code", again === code(owner));
    expect("and leaves exactly one row", rows?.n === 1);

    throw ROLLBACK;
  });
} catch (e) {
  if (e !== ROLLBACK) {
    console.error(`FAIL setup: ${(e as Error).message}`);
    failures.push("setup");
  }
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll share checks passed");
process.exit(0);
