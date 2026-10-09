import { daysBetween, weekday } from "@/lib/tracker/dates";
import { parseProposal } from "./proposals";

// Pure rules for coach chat threads: titles, the per-user rate window, what
// the UI says about tool calls, citations and transcripts. The route, the
// server actions and the chat UI share these.

export const COACH_KINDS = ["chat", "lesson", "review", "mock"] as const;

const TITLE_MAX = 60;

/** A thread's title: the first line of its first message, trimmed to fit a list row. */
export function threadTitle(text: string): string {
  const line =
    text
      .split("\n")
      .map((l) =>
        l
          .replace(/[#*_`>~]+/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .find(Boolean) ?? "";
  if (!line) return "New chat";
  if (line.length <= TITLE_MAX) return line;
  const cut = line.slice(0, TITLE_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > TITLE_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export const RATE_LIMIT = { limit: 30, windowMs: 10 * 60_000 };

/**
 * Sliding window over the times of a user's recent messages. Returns the list
 * to store back (this message included when allowed) and, when refused, how
 * long until the oldest message leaves the window.
 */
export function rateCheck(
  stored: unknown[],
  now: number,
  { limit, windowMs }: { limit: number; windowMs: number } = RATE_LIMIT,
): { allowed: boolean; retryAfterSec: number; stamps: number[] } {
  const recent = stored.filter((t): t is number => typeof t === "number" && t > now - windowMs).toSorted((a, b) => a - b);
  if (recent.length < limit) return { allowed: true, retryAfterSec: 0, stamps: [...recent, now] };
  const oldest = recent[recent.length - limit] ?? now;
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)), stamps: recent };
}

// What each read tool looks up, for the muted activity lines under a message.
const TOOL_WHAT: Record<string, string> = {
  get_progress: "your progress",
  get_weak_spots: "your weak spots",
  get_recent_activity: "your recent activity",
  get_plan: "your plan",
  find_problems: "problems",
  find_cards: "cards",
  get_friend_summary: "your friends' stats",
};

const ACTION_LABEL: Record<string, string> = {
  queue_cards: "Suggested cards for your feed",
  add_mission: "Suggested a mission",
  suggest_template_change: "Suggested a plan change",
  save_memory: "Suggested something to remember",
  start_mock: "Suggested a mock interview",
  queue_ladder: "Suggested problems for your plan",
  finish_lesson: "Noted what you learned",
  end_mock: "Offered to end the mock",
};

export type ToolPhase = "running" | "done" | "error" | "limited";

export function toolLabel(name: string, phase: ToolPhase): string {
  // A call the app refused for hitting the budget never ran, so its line says
  // that honestly rather than dressing it up as "Couldn't look up…".
  if (phase === "limited") return "Skipped — at the tool limit";
  if (name === "search_knowledge") {
    return phase === "running" ? "Searching the library…" : phase === "done" ? "Searched the library" : "Couldn't search the library";
  }
  // Not a suggestion (nothing to confirm) and not a lookup: it quietly tells the admin what the Library lacks.
  if (name === "note_library_gap") {
    return phase === "running" ? "Passing on a topic…" : phase === "done" ? "Passed on a missing topic" : "Couldn't pass on a topic";
  }
  const what = TOOL_WHAT[name];
  if (what) return phase === "running" ? `Looking up ${what}…` : phase === "done" ? `Looked up ${what}` : `Couldn't look up ${what}`;
  const action = ACTION_LABEL[name];
  if (action) return phase === "error" ? "Couldn't make a suggestion" : action;
  const plain = name.replace(/_/g, " ");
  return phase === "running" ? `Using ${plain}…` : phase === "done" ? `Used ${plain}` : `Couldn't use ${plain}`;
}

const TOOL_PREFIX = "tool-";

/**
 * The one failure test a tool step uses, shared by `ToolLine` and
 * `workingSummary` so the summary can never disagree with a tool row on what
 * counts as failed: an error state, or an output that reports an error.
 */
export function toolFailed(state: string | undefined, output: unknown): boolean {
  return state === "output-error" || (state === "output-available" && Boolean((output as { error?: unknown } | null)?.error));
}

/** A call the tool budget refused: `limitToolCalls` returns `{ limited }`, not `{ error }`. */
export function toolLimited(state: string | undefined, output: unknown): boolean {
  return state === "output-available" && Boolean((output as { limited?: unknown } | null)?.limited);
}

export type WorkingSummary = { label: string; done: number; total: number; failed: number; limited: number };

/**
 * What a message's tool steps add up to, for the quiet working line and the
 * "Checked N things" fold. Proposal parts are left out: they render as their
 * own cards, so counting them here would make the fold's total disagree with
 * the rows inside it. `label` is the newest step still running, so the wording
 * stays in `toolLabel`; empty once every step has finished. Null when there are
 * no tool parts, so a plain reply renders no line at all.
 */
export function workingSummary(parts: readonly LoosePart[]): WorkingSummary | null {
  const steps = parts.filter((p) => {
    if (typeof p.type !== "string" || !p.type.startsWith(TOOL_PREFIX)) return false;
    return !parseProposal(p.state === "output-available" ? p.output : undefined);
  });
  if (steps.length === 0) return null;

  let done = 0;
  let failed = 0;
  let limited = 0;
  for (const step of steps) {
    const output = step.state === "output-available" ? step.output : undefined;
    if (toolFailed(step.state, output)) failed++;
    else if (toolLimited(step.state, output)) limited++;
    else if (step.state === "output-available") done++;
  }

  const running = steps.findLast((s) => s.state !== "output-available" && s.state !== "output-error");
  const label = running ? toolLabel(running.type.slice(TOOL_PREFIX.length), "running") : "";
  return { label, done, total: steps.length, failed, limited };
}

export type Citation = { title: string; url: string };

type LoosePart = { type: string; state?: string; output?: unknown; text?: string };

const isWebLink = (url: string) => /^https?:\/\//i.test(url);

/** Sources the answer used: every search_knowledge result in the message, once each. */
export function citationsOf(parts: readonly LoosePart[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const part of parts) {
    if (part.type !== "tool-search_knowledge" || part.state !== "output-available") continue;
    const results = (part.output as { results?: unknown } | undefined)?.results;
    if (!Array.isArray(results)) continue;
    for (const r of results) {
      const { title, url } = (r ?? {}) as { title?: unknown; url?: unknown };
      if (typeof url !== "string" || !isWebLink(url) || seen.has(url)) continue;
      seen.add(url);
      out.push({ title: typeof title === "string" && title ? title : url, url });
    }
  }
  return out;
}

/** What was said in a thread, for memory extraction. Tool calls are left out. */
export function transcriptOf(messages: readonly { role: string; parts: readonly LoosePart[] }[]): string {
  return messages
    .map((m) => {
      const text = m.parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("\n")
        .trim();
      return text ? `${m.role === "user" ? "User" : "Coach"}: ${text}` : null;
    })
    .filter(Boolean)
    .join("\n\n");
}

const QUIET_MINUTES = 30;

/** A thread with no message for 30 minutes is over; its memory can be extracted. */
export function isQuiet(updatedAt: string, now: Date): boolean {
  return now.getTime() - new Date(updatedAt).getTime() >= QUIET_MINUTES * 60_000;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** When a thread was last active, for the thread list. Both dates are local YYYY-MM-DD. */
export function whenLabel(date: string, today: string): string {
  const ago = daysBetween(date, today);
  if (ago <= 0) return "Today";
  if (ago === 1) return "Yesterday";
  if (ago < 7) return WEEKDAYS[weekday(date)];
  return `${MONTHS[Number(date.slice(5, 7)) - 1] ?? ""} ${Number(date.slice(8, 10))}`;
}
