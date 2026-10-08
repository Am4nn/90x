import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userApprovals } from "@/db/schema";
import { logError } from "@/lib/log";
import { maintenanceOn } from "@/lib/maintenance/flag";
import { breakGlass } from "@/lib/maintenance/rules";
import { getSettings } from "@/lib/settings";
import { decide, type Verdict } from "./guard-rules";
import { readSpend } from "./usage";

// The one question every AI entry point asks before it spends: may this person's call run?
// Cards, Today, the Library and the Tracker never call AI, so a stop here leaves them working.

export type AiGate = Verdict;

/** What to tell a person when AI is stopped for everyone (paused, or past a spend line). */
const AI_RESTING = "AI is resting for now. Everything else still works. Try again a little later.";

/** What to tell a person who has used their own daily allowance. Never says how much the allowance is. */
const ALLOWANCE_USED = "You've used today's AI allowance. It resets tomorrow. Cards, Today and the Library still work.";

/** The sentence for a refused call. The amounts behind these limits are server-side and for admins only. */
export function refusal(gate: Extract<AiGate, { allowed: false }>): string {
  return gate.reason === "user-cap" ? ALLOWANCE_USED : AI_RESTING;
}

/** Whether an AI call may run, for this person when given. A failure to read the meters lets it through, and logs. */
export async function aiGate(userId?: string | null): Promise<AiGate> {
  // While the app is down only admins use it; any other person's call (one already under way, say) is refused.
  // Without a person (the Coach's model choice) there is no one to refuse, unless the break-glass is on.
  // The break-glass stops admins too, so it refuses before any lookup.
  if (breakGlass() || (userId && (await maintenanceOn()) && !(await isAdmin(userId)))) {
    console.log(JSON.stringify({ evt: "ai.skip", reason: "maintenance" }));
    return { allowed: false, reason: "maintenance" };
  }
  const settings = await getSettings();
  // Paused needs no meters, so a stop switch still works when Redis and the database struggle.
  if (settings.aiPaused) return { allowed: false, reason: "paused" };
  return decide(settings, await readSpend(userId));
}

/** Asked only while maintenance is on. A failed lookup counts as not an admin: the app is down, so the safe side is no AI. */
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: userApprovals.userId })
      .from(userApprovals)
      .where(and(eq(userApprovals.userId, userId), eq(userApprovals.status, "approved"), eq(userApprovals.isAdmin, true)))
      .limit(1);
    return Boolean(row);
  } catch (e) {
    logError("admin lookup failed during maintenance", e);
    return false;
  }
}
