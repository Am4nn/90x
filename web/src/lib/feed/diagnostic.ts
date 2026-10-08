import { shuffled } from "./random";

// First-visit diagnostic: a few cards per area at mixed
// difficulty so readiness starts from data.

export const DIAGNOSTIC_AREAS = ["dsa", "system_design", "cs", "java", "sql"] as const;

type Difficulty = "Easy" | "Medium" | "Hard";
type PoolCard = { id: string; area: string; difficulty: Difficulty | null; topic: string };

// Easiest first; longer diagnostics repeat the pattern.
const SLOT_PATTERN: Difficulty[] = ["Easy", "Medium", "Medium", "Hard"];

// Fills the slots in passes, loosest last: right difficulty on a new topic,
// any difficulty on a new topic, right difficulty, anything. A new topic beats
// the right difficulty.
function pickForArea(cards: PoolCard[], perArea: number): string[] {
  const slots: (PoolCard | null)[] = Array.from({ length: Math.min(perArea, cards.length) }, () => null);
  const usedIds = new Set<string>();
  const usedTopics = new Set<string>();
  const passes: { matchDifficulty: boolean; newTopic: boolean }[] = [
    { matchDifficulty: true, newTopic: true },
    { matchDifficulty: false, newTopic: true },
    { matchDifficulty: true, newTopic: false },
    { matchDifficulty: false, newTopic: false },
  ];
  for (const { matchDifficulty, newTopic } of passes) {
    for (const [index, slot] of slots.entries()) {
      if (slot) continue;
      const wanted = SLOT_PATTERN[index % SLOT_PATTERN.length];
      const card = cards.find(
        (candidate) =>
          !usedIds.has(candidate.id) &&
          (!matchDifficulty || candidate.difficulty === wanted) &&
          (!newTopic || !usedTopics.has(candidate.topic)),
      );
      if (!card) continue;
      slots[index] = card;
      usedIds.add(card.id);
      usedTopics.add(card.topic);
    }
  }
  return slots.flatMap((card) => (card ? [card.id] : []));
}

/** `answered`: cards the reader has already answered in the Feed (the offer sits above live cards, so they may
 *  have answered a few before pressing Start). Asking those again would count them twice toward readiness. */
export function pickDiagnostic(pool: PoolCard[], perArea = 4, seed = 0, answered: ReadonlySet<string> = new Set()): string[] {
  const order = shuffled(
    pool.filter((card) => !answered.has(card.id)),
    seed,
  );
  const perAreaPicks = DIAGNOSTIC_AREAS.map((area) =>
    pickForArea(
      order.filter((card) => card.area === area),
      perArea,
    ),
  );
  const rounds = Math.max(0, ...perAreaPicks.map((ids) => ids.length));
  const result: string[] = [];
  for (let round = 0; round < rounds; round++) {
    for (const ids of perAreaPicks) {
      const id = ids[round];
      if (id !== undefined) result.push(id);
    }
  }
  return result;
}
