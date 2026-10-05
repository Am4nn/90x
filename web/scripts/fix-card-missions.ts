// One-off data fix for "10 cards" becoming one fixed daily mission instead of a
// plan slot (Missions). Run with `bun run fix:card-missions`
// (a dry run that only reads and prints) or `bun run fix:card-missions -- --apply`
// (one transaction that writes). It is safe to run twice: the second run finds
// nothing.
//
//   a. Every campaign: remove the `cards` key from each weekday of
//      campaigns.templates. The planner ignores it now, but the Plan page and
//      the Coach would keep showing it.
//   b. Every user's today and later: where a day has more than one plain cards
//      mission, keep one and delete the other open ones. A done one is kept if
//      there is one (progress is real, and if several are done they all stay),
//      otherwise the first by ref then id (the table has no created_at).
//      Revive missions (a missed day's copy) and extras are other work on
//      purpose, never duplicates, so they are left alone. Past days are history
//      and are left alone too.
//
// "Today" is each user's own: the date in profiles.timezone right now, the same
// rule the app uses (localDate). A user with no profile row counts as UTC.

import postgres from "postgres";

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set. See .env.example.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const sql = postgres(url, { prepare: false, max: 1 });

type CampaignRow = { id: string; user_id: string; status: string; days_with_cards: number; cards_total: number };
type MissionRow = { id: string; user_id: string; date: string; ref: string; status: string };

console.log(apply ? "APPLY: writing in one transaction.\n" : "DRY RUN: nothing is written. Pass --apply to change data.\n");

try {
  await sql.begin(async (tx) => {
    if (!apply) await tx`set transaction read only`;

    // a. Stored templates that still have a cards count on any weekday.
    const campaigns = await tx<CampaignRow[]>`
      select c.id, c.user_id, c.status,
             count(*) filter (where (d.v ->> 'cards') is not null)::int as days_with_cards,
             coalesce(sum(case when jsonb_typeof(d.v -> 'cards') = 'number' then (d.v ->> 'cards')::int end), 0)::int as cards_total
      from public.campaigns c, jsonb_each(c.templates) as d(k, v)
      where jsonb_typeof(d.v) = 'object'
      group by c.id, c.user_id, c.status
      having count(*) filter (where (d.v ->> 'cards') is not null) > 0
      order by c.user_id, c.id`;
    console.log(`a. Campaigns with a cards count in their templates: ${campaigns.length}`);
    for (const c of campaigns) {
      console.log(`   ${c.id} user ${c.user_id} (${c.status}): ${c.days_with_cards} weekdays, ${c.cards_total} card slots in total`);
    }
    if (apply && campaigns.length) {
      const stripped = await tx`
        update public.campaigns
        set templates = (
          select jsonb_object_agg(d.k, case when jsonb_typeof(d.v) = 'object' then d.v - 'cards' else d.v end)
          from jsonb_each(templates) as d(k, v)
        )
        where id in ${tx(campaigns.map((c) => c.id))}
        returning id`;
      console.log(`   stripped cards from ${stripped.length} campaigns`);
    }

    // b. Duplicate plain cards missions on each user's today and later.
    const rows = await tx<MissionRow[]>`
      select m.id, m.user_id, m.date::text as date, m.ref, m.status
      from public.missions m
      left join public.profiles p on p.user_id = m.user_id
      where m.slot_type = 'cards' and not m.is_revive and not m.is_extra
        and m.date >= (now() at time zone coalesce(p.timezone, 'UTC'))::date
        and (m.user_id, m.date) in (
          select user_id, date from public.missions
          where slot_type = 'cards' and not is_revive and not is_extra
          group by user_id, date having count(*) > 1
        )
      order by m.user_id, m.date, (m.status = 'done') desc, m.ref, m.id`;

    const groups = new Map<string, MissionRow[]>();
    for (const r of rows) groups.set(`${r.user_id} ${r.date}`, [...(groups.get(`${r.user_id} ${r.date}`) ?? []), r]);

    const remove: string[] = [];
    let kept = 0;
    let keptDone = 0;
    console.log(`\nb. User-days (today or later) with more than one cards mission: ${groups.size}`);
    for (const [key, group] of groups) {
      // Rows arrive done first, then by ref and id, so a done one leads the group.
      const done = group.filter((m) => m.status === "done");
      const keep = done.length ? done : group.slice(0, 1);
      const drop = group.filter((m) => !keep.includes(m));
      kept += keep.length;
      keptDone += done.length;
      remove.push(...drop.map((m) => m.id));
      console.log(
        `   ${key}: keep ${keep.map((m) => `${m.ref} (${m.status})`).join(", ")}; delete ${drop.map((m) => `${m.ref} (${m.status})`).join(", ") || "nothing"}`,
      );
    }
    console.log(`   would keep ${kept} (${keptDone} already done), delete ${remove.length}`);
    if (apply && remove.length) {
      const deleted = await tx`delete from public.missions where id in ${tx(remove)} and status <> 'done' returning id`;
      console.log(`   deleted ${deleted.length} missions`);
    }

    console.log(apply ? "\nDone. Committing." : "\nDry run finished. Nothing was changed.");
  });
} catch (e) {
  console.error(`FAIL: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
