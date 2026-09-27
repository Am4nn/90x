// What e2e/fake-model.ts answers with, shared with the specs that check for it.

export const FAKE_MODEL_URL = `http://localhost:${process.env.FAKE_MODEL_PORT ?? 8078}`;

/** One call the fake model got, as GET /requests lists it. */
export type SeenRequest = { model: string; system: string; user: string; json: boolean };

/** The coach's streamed answer to any chat message. */
export const fakeReply = (user: string) =>
  `Stub coach reply to "${user.slice(0, 80)}". Start with the brute force, then look for a hash map.`;

/** The solution review every "Review my solution" gets. */
export const FAKE_REVIEW = {
  correct: true,
  complexity: { yours: { time: "O(n^2)", space: "O(1)" }, best: { time: "O(n)", space: "O(n)" } },
  betterApproach: "Keep a hash map from value to index and look up the complement in one pass.",
  lineNotes: [{ line: 1, note: "Stub line note from the fake model." }],
  patternLesson: "Trade space for time with a hash map of what you've seen.",
  nextProblemSlug: null,
};
