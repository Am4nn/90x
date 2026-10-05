// Read-only: why does (or doesn't) a user get push notifications?
//
//   DIAG_DB_URL=postgres://... bun run scripts/push-diagnose.ts someone@example.com
//
// Defaults to the local Supabase database. Prints the user's subscriptions (the push
// service host only, never the endpoint path or keys), their notification settings, and
// what the hourly job would do for them now and over the next 24 hours.
import postgres from "postgres";
import { endpointHost } from "../src/lib/push-rules";
import { localDate, localHour } from "../src/lib/tracker/dates";
import { dueJobs } from "../src/lib/tracker/notify";

const email = process.argv[2];
if (!email) {
  console.error("Usage: bun run scripts/push-diagnose.ts <email>");
  process.exit(1);
}
const url = process.env.DIAG_DB_URL || "postgres://postgres:postgres@127.0.0.1:64322/postgres";
const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10 });

type Notifications = { evening?: boolean; friends?: boolean; weekly?: boolean };

function line(label: string, value: unknown) {
  console.log(`${label.padEnd(26)}${value}`);
}

try {
  const [user] = await sql<{ id: string }[]>`select id from auth.users where lower(email) = lower(${email})`;
  if (!user) {
    console.log(`No account for ${email}.`);
    process.exit(2);
  }

  const [profile] = await sql<{ timezone: string; morning: number | null; notifications: Notifications | null; setup: Date | null }[]>`
    select timezone, morning_push_hour as morning, notifications, setup_done_at as setup
    from public.profiles where user_id = ${user.id}`;
  const [approval] = await sql<{ status: string }[]>`select status from public.user_approvals where user_id = ${user.id}`;
  const subs = await sql<
    {
      endpoint: string;
      created_at: Date;
      last_ok_at: Date | null;
      last_error_at: Date | null;
      last_status: number | null;
      last_error: string | null;
      fail_count: number;
    }[]
  >`select endpoint, created_at, last_ok_at, last_error_at, last_status, last_error, fail_count
    from public.push_subscriptions where user_id = ${user.id} order by created_at`;

  console.log("== Account");
  line("approval", approval?.status ?? "none");
  line("setup done", profile?.setup ? "yes" : "NO (the hourly job skips users who have not finished setup)");
  line("timezone", profile?.timezone ?? "-");

  console.log("\n== Subscriptions");
  if (!subs.length) console.log("none: this user has no device subscribed, so nothing can be sent.");
  for (const s of subs) {
    console.log(`- ${endpointHost(s.endpoint)}`);
    line("  created", s.created_at.toISOString());
    line("  last accepted", s.last_ok_at?.toISOString() ?? "never");
    line(
      "  last failed",
      s.last_error_at
        ? `${s.last_error_at.toISOString()} (HTTP ${s.last_status ?? "?"}${s.last_error ? `: ${s.last_error}` : ""})`
        : "never",
    );
    line("  failure streak", s.fail_count);
  }

  console.log("\n== Notification settings");
  const n = profile?.notifications ?? {};
  const evening = n.evening ?? true; // same defaults as settingsOf in src/lib/push.ts
  line("evening streak (8 pm)", evening ? "on" : "off");
  line("friend activity", (n.friends ?? false) ? "on" : "off");
  line("weekly review (Sun 6 pm)", (n.weekly ?? true) ? "on" : "off");
  line("morning plan hour", profile?.morning == null ? "off (default: no morning push)" : `${profile.morning}:00`);

  if (profile) {
    const user1 = { userId: user.id, timezone: profile.timezone, morningHour: profile.morning, evening };
    const eligible = approval?.status === "approved" && Boolean(profile.setup);
    console.log("\n== Would the hourly job pick this user?");
    line("eligible", eligible ? "yes" : "NO (needs approved and setup done)");
    const start = new Date();
    start.setUTCMinutes(5, 0, 0);
    const upcoming: string[] = [];
    for (let h = 0; h < 25; h++) {
      const at = new Date(start.getTime() + h * 3_600_000);
      const kinds = dueJobs([user1], at)
        .map((j) => j.kind)
        .filter((k) => k !== "rollover");
      if (kinds.length)
        upcoming.push(
          `${at.toISOString()} (local ${localDate(profile.timezone, at)} ${localHour(profile.timezone, at)}:00): ${kinds.join(", ")}`,
        );
    }
    const nowKinds = dueJobs([user1], new Date()).map((j) => j.kind);
    line("due this hour", nowKinds.length ? nowKinds.join(", ") : "nothing");
    console.log("next 24h:");
    console.log(
      upcoming.length
        ? upcoming.map((u) => `  ${u}`).join("\n")
        : "  nothing. (Evening/morning pushes also need open missions at send time.)",
    );
  }
  console.log(
    "\nNot checked here: VAPID keys and the QStash schedule. Look for push.hourly lines in the Vercel logs: none means the schedule is not running.",
  );
} finally {
  await sql.end();
}
