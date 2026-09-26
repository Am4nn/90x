// Creates or updates 90x's QStash schedules. Needs a public https app URL
// (QStash can't reach localhost): run after deploying, with NEXT_PUBLIC_APP_URL
// set to the Vercel URL. Usage: bun run schedule:jobs
import { Client } from "@upstash/qstash";

const SCHEDULES = [
  { id: "90x-leetcode-sync", path: "/api/jobs/leetcode-sync", cron: "0 */6 * * *" },
  // Minute 5 of every hour: each user's midnight rollover, morning plan and 8 pm reminder.
  { id: "90x-hourly", path: "/api/jobs/hourly", cron: "5 * * * *" },
];

const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
if (!app?.startsWith("https://")) {
  console.error(`NEXT_PUBLIC_APP_URL must be the public https URL (got ${app ?? "nothing"}). QStash can't call localhost.`);
  process.exit(1);
}

const client = new Client({ token: process.env.QSTASH_TOKEN!, baseUrl: process.env.QSTASH_URL || undefined });
for (const s of SCHEDULES) {
  await client.schedules.create({ scheduleId: s.id, destination: `${app}${s.path}`, cron: s.cron });
  console.log(`scheduled ${s.id}: ${s.cron} → ${app}${s.path}`);
}
