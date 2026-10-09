// What e2e/fake-model.ts answers with, shared with the specs that check for it.

export const FAKE_MODEL_URL = `http://localhost:${process.env.FAKE_MODEL_PORT ?? 8078}`;

/** One call the fake model got, as GET /requests lists it. */
export type SeenRequest = { model: string; system: string; user: string; json: boolean };

/** The coach's streamed answer to any chat message. */
export const fakeReply = (user: string) =>
  `Stub coach reply to "${user.slice(0, 80)}". Start with the brute force, then look for a hash map.`;

/** One tool call the fake model can play back for a message. */
export type FakeToolCall = { name: string; args: Record<string, unknown> };

/**
 * Tool scripts the fake model plays back for chat messages, keyed by the exact
 * user message. The chat.spec tests never send these, so they stay clear of the
 * plain replies those tests read. The coach's tools run for real against the
 * seeded database, so a read tool here returns a real summary and a bad `ref`
 * on add_mission returns a real error.
 */
export const TOOL_SCRIPTS: Record<string, FakeToolCall[]> = {
  // Three read tools, one per round, so the working line shows a rising count.
  "Coach, check my weak spots with the tools": [
    { name: "get_progress", args: {} },
    { name: "get_weak_spots", args: {} },
    { name: "get_plan", args: {} },
  ],
  // A read tool then a failing action: proves the failure is visible collapsed.
  "Coach, check my weak spots and break one": [
    { name: "get_progress", args: {} },
    { name: "add_mission", args: { kind: "problem", ref: "no-such-problem" } },
  ],
  // One action tool, so a proposal still renders as its own card.
  "Coach, suggest a problem for me": [{ name: "add_mission", args: { kind: "problem", ref: "two-sum" } }],
};

/** The solution review every "Review my solution" gets. */
export const FAKE_REVIEW = {
  correct: true,
  complexity: { yours: { time: "O(n^2)", space: "O(1)" }, best: { time: "O(n)", space: "O(n)" } },
  betterApproach: "Keep a hash map from value to index and look up the complement in one pass.",
  lineNotes: [{ line: 1, note: "Stub line note from the fake model." }],
  patternLesson: "Trade space for time with a hash map of what you've seen.",
  nextProblemSlug: null,
};

/** What "Add with Coach" answers: two seeded problems, as picks. Low importance (0.5), so the planner does not put them on a fresh user's Today, where validatePicks would drop them as already open. */
export const FAKE_ADD = {
  say: "Two you haven't tried.",
  picks: [
    { kind: "problem", ref: "top-k-frequent-elements", why: "Counting with a hash map." },
    { kind: "problem", ref: "trapping-rain-water", why: "Two pointers, one pass." },
  ],
};
