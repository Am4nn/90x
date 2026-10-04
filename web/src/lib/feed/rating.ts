// A reader's star rating of a card. Pure: the words, the colours and the band the
// admin reads it as. The one-to-five scale is the reader's; Good / Normal / Bad is
// the admin's summary of it.

export const RATING_LABELS = ["Poor", "Weak", "Fine", "Good", "Excellent"] as const;
const RATING_PROMPT = "Rate this card";

export type RatingBand = "bad" | "normal" | "good";

/** 1-2 stars is Bad, 3 is Normal, 4-5 is Good. */
export function ratingBand(stars: number): RatingBand {
  return stars <= 2 ? "bad" : stars === 3 ? "normal" : "good";
}

/** Whether a value is a rating a reader can give. */
export const isStars = (value: unknown): value is 1 | 2 | 3 | 4 | 5 =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;

/** The label under the stars: the hovered star's word, else the chosen one's, else the prompt. */
export function ratingLabel(chosen: number | null, hover: number | null): string {
  const shown = hover ?? chosen;
  return (shown ? RATING_LABELS[shown - 1] : undefined) ?? RATING_PROMPT;
}

/** Tapping the chosen star again clears the rating. */
export const nextRating = (chosen: number | null, tapped: number): number | null => (chosen === tapped ? null : tapped);
