// Checks saving push subscriptions against the real database: the per-user cap and the
// endpoint allowlist. Everything runs in one transaction that is always rolled back.
// Run with `bun run check:push`.

import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { saveSubscription } from "@/lib/push";
import { MAX_PUSH_SUBSCRIPTIONS } from "@/lib/push-rules";

// This check writes (then rolls back) rows: never let it near a real database. The host is read from the
// parsed URL, so "@localhost" inside a password cannot pass for it.
const hostOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
};
for (const url of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
  const host = hostOf(url);
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.error("check-push runs only against a local database (127.0.0.1 or localhost).");
    process.exit(1);
  }
}

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const [a, b] = ["00000000-0000-4000-8000-0000000000c1", "00000000-0000-4000-8000-0000000000c2"] as const;
const endpoint = (who: string, i: number) => `https://fcm.googleapis.com/fcm/send/check-push-${who}-${i}`;
const keys = { p256dh: "key", auth: "auth" };

const ROLLBACK = new Error("rollback");

try {
  await db.transaction(async (tx) => {
    for (const id of [a, b]) {
      await tx.execute(
        sql`insert into auth.users (id, email, aud, role) values (${id}, ${`push-${id.slice(-2)}@example.test`}, 'authenticated', 'authenticated')`,
      );
    }
    const endpointsOf = async (userId: string) =>
      (
        await tx
          .select({ endpoint: pushSubscriptions.endpoint })
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, userId))
          .orderBy(asc(pushSubscriptions.createdAt))
      ).map((r) => r.endpoint);
    // Every save in one transaction gets the same now(), so give each a distinct age, oldest first.
    const save = async (userId: string, who: string, i: number) => {
      const ok = await saveSubscription(userId, { endpoint: endpoint(who, i), keys }, tx);
      await tx
        .update(pushSubscriptions)
        .set({ createdAt: sql`now() - make_interval(mins => ${100 - i})` })
        .where(eq(pushSubscriptions.endpoint, endpoint(who, i)));
      return ok;
    };

    // B has three devices; none of A's saves may touch them.
    for (let i = 0; i < 3; i++) await save(b, "b", i);

    let allSaved = true;
    for (let i = 0; i < 12; i++) allSaved = (await save(a, "a", i)) && allSaved;
    const kept = await endpointsOf(a);
    const newest = Array.from({ length: MAX_PUSH_SUBSCRIPTIONS }, (_, k) => endpoint("a", 12 - MAX_PUSH_SUBSCRIPTIONS + k));
    expect(
      `12 saves leave the ${MAX_PUSH_SUBSCRIPTIONS} newest, the one just saved included`,
      allSaved && kept.length === MAX_PUSH_SUBSCRIPTIONS && kept.every((e, k) => e === newest[k]),
      `${kept.length}: ${kept.map((e) => e.split("-").pop()).join(",")}`,
    );
    expect("another user's devices are untouched", (await endpointsOf(b)).join() === [0, 1, 2].map((i) => endpoint("b", i)).join());

    // Re-saving a device already kept (here the oldest one left) deletes nothing.
    const oldest = kept[0]!;
    const again = await saveSubscription(a, { endpoint: oldest, keys }, tx);
    const afterResave = await endpointsOf(a);
    expect(
      "re-saving an existing device deletes nothing",
      again && afterResave.length === MAX_PUSH_SUBSCRIPTIONS && afterResave.toSorted().join() === kept.toSorted().join(),
    );

    // Not a push service: refused, and nothing changes.
    const refused = await saveSubscription(a, { endpoint: "https://victim.example/hook", keys }, tx);
    const plainHttp = await saveSubscription(a, { endpoint: "http://fcm.googleapis.com/fcm/send/x", keys }, tx);
    expect(
      "an endpoint that is not a listed https push service is refused and saves nothing",
      !refused && !plainHttp && (await endpointsOf(a)).length === MAX_PUSH_SUBSCRIPTIONS,
    );

    throw ROLLBACK;
  });
} catch (e) {
  if (e !== ROLLBACK) {
    console.error(`FAIL setup: ${(e as Error).message}`);
    failures.push("setup");
  }
}

// Concurrency needs real connections, so this part commits: one throwaway user, deleted (with its devices,
// by cascade) at the end. Fifteen devices subscribing at once must still leave ten.
const racer = "00000000-0000-4000-8000-0000000000c3";
try {
  await db.execute(sql`delete from auth.users where id = ${racer}`);
  await db.execute(
    sql`insert into auth.users (id, email, aud, role) values (${racer}, 'push-c3@example.test', 'authenticated', 'authenticated')`,
  );
  const saved = await Promise.all(Array.from({ length: 15 }, (_, i) => saveSubscription(racer, { endpoint: endpoint("race", i), keys })));
  const [row] = await db.select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, racer));
  expect(
    `${saved.length} saves at once still leave at most ${MAX_PUSH_SUBSCRIPTIONS}`,
    saved.every(Boolean) && row?.n === MAX_PUSH_SUBSCRIPTIONS,
    `${row?.n} left`,
  );
} catch (e) {
  console.error(`FAIL concurrent saves: ${(e as Error).message}`);
  failures.push("concurrent saves");
} finally {
  await db.execute(sql`delete from auth.users where id = ${racer}`);
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll push checks passed");
process.exit(0);
