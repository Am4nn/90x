import { syncUser, usersToSync } from "@/lib/activity/service";
import { qstashJob } from "@/lib/upstash/qstash";

/** QStash schedule 90x-leetcode-sync (every 6 h): sync every user with a LeetCode username. */
export const POST = qstashJob("/api/jobs/leetcode-sync", async () => {
  const results: Record<string, string> = {};
  for (const userId of await usersToSync()) {
    const r = await syncUser(userId);
    results[userId] = r.status === "ok" ? `ok (${r.created.length} new)` : r.status;
  }
  return { synced: Object.keys(results).length, results };
});
