import { shuffled } from "./random";

// Batch review in /admin: each batch shows 20 cards,
// riskiest first plus random fill, and publishes at 18 of 20 good.

export const SAMPLE_SIZE = 20;
export const PASS_AT = 18;

type SampleCard = { id: string; risk: number | null };

// A card the AI reviewer never scored counts as safest.
const riskOf = (card: SampleCard) => card.risk ?? 1;

export function pickReviewSample(cards: SampleCard[], seed: number, size = SAMPLE_SIZE): string[] {
  const unique = cards.filter((card, index) => cards.findIndex((other) => other.id === card.id) === index);
  // Sorting is stable, so equal risks keep their input order.
  const byRisk = unique.toSorted((a, b) => riskOf(a) - riskOf(b));
  const riskiest = byRisk.slice(0, Math.ceil(size / 2));
  const fill = shuffled(byRisk.slice(riskiest.length), seed).slice(0, Math.max(0, size - riskiest.length));
  return [...riskiest, ...fill].map((card) => card.id);
}

/**
 * `size` is how many cards the batch sample has (SAMPLE_SIZE, or the whole
 * batch when it is smaller); `passAt` is out of SAMPLE_SIZE and is scaled to it.
 */
export function batchVerdict(verdicts: ("good" | "bad")[], size = SAMPLE_SIZE, passAt = PASS_AT): "pending" | "published" | "rejected" {
  if (size <= 0 || verdicts.length < size) return "pending";
  const goods = verdicts.slice(0, size).filter((verdict) => verdict === "good").length;
  return goods >= Math.ceil((passAt * size) / SAMPLE_SIZE) ? "published" : "rejected";
}
