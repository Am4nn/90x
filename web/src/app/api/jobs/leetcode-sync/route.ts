import { NextResponse } from "next/server";
import { syncUser, usersToSync } from "@/lib/activity/service";
import { verifyQStash } from "@/lib/upstash/qstash";

const PATH = "/api/jobs/leetcode-sync";

/** QStash schedule 90x-leetcode-sync (every 6 h): sync every user with a LeetCode username. */
export async function POST(request: Request) {
  const body = await request.text();
  if (!(await verifyQStash(request, body, PATH))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const results: Record<string, string> = {};
  for (const userId of await usersToSync()) {
    const r = await syncUser(userId);
    results[userId] = r.status === "ok" ? `ok (${r.created.length} new)` : r.status;
  }
  return NextResponse.json({ synced: Object.keys(results).length, results });
}
