import type { AnswerInput, CardView } from "@/lib/feed/view";

// The props every primitive answer screen receives, so `card.tsx` can dispatch
// on `card.primitive` uniformly and each C part owns one file without editing
// the dispatch.
export type PrimitiveAnswerProps = {
  card: CardView;
  /** The answer is in flight. */
  pending: boolean;
  /** Which answer action is in flight, for button labels. */
  busy: string | null;
  /** Submits an answer; `choice` is the picked option index for the result view. */
  onSubmit: (input: AnswerInput, choice?: number | null) => void;
};
