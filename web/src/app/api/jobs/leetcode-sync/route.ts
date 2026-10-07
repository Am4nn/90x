import { syncUser, usersToSync } from "@/lib/activity/service";
import { judgeLeetcode, type LeetcodeResult } from "@/lib/jobs/outcomes";
import { qstashJob } from "@/lib/upstash/qstash";

const MAX_ERRORS = 3;

/** QStash schedule 90x-leetcode-sync (every 6 h): sync every user with a LeetCode username.
 *  Returns counts, not one line per user, plus up to three distinct failure reasons for the admin page. */
export const POST = qstashJob(
  "/api/jobs/leetcode-sync",
  async () => {
    const result: LeetcodeResult = { users: 0, ok: 0, new: 0, failed: 0, skipped: 0, disabled: 0, unknown: 0, errors: [] };
    for (const userId of await usersToSync()) {
      const r = await syncUser(userId);
      result.users++;
      if (r.status === "ok") {
        result.ok++;
        result.new += r.created.length;
      } else if (r.status === "failed") {
        result.failed++;
        const why = String(r.error ?? "unknown error").slice(0, 160);
        if (result.errors.length < MAX_ERRORS && !result.errors.includes(why)) result.errors.push(why);
      } else if (r.status === "skipped") {
        result.skipped++;
      } else if (r.status === "unknown_user") {
        result.unknown++;
      } else {
        result.disabled++;
      }
    }
    return result;
  },
  judgeLeetcode,
);
