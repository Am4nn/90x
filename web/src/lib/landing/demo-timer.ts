// The phone demo: one Feed card that answers itself on a timer, in three steps of four seconds
// (tap an answer, Ren marks it, the next review is booked), looping, and alternating a right
// answer with a wrong one. Pure, so the steps and the copy are tested without a browser; the
// component only keeps a tick counter.
import { DEMO_ANSWER } from "./demo";
import { FIRST_CORRECT_DAYS, FIRST_MISS_DAYS, whenText } from "./review-days";

export const STEP_MS = 4000;
/** The phone demo's review strip: today and the 30 days after it, one square each, so day 30 lights square 30. (The desktop pinned demo keeps `REVIEW_STRIP`: 21 squares, "+1" and "+30" already, unchanged.) */
export const PHONE_STRIP_SQUARES = 31;
export const STEP_LABELS = ["You tap an answer", "Ren marks it", "Next review booked"] as const;

/** The first choice on the card, "A longer timeout", is the wrong answer the demo taps on its wrong cycles. */
const WRONG_TAP = 0; // demo-timer.test.ts pins that this is not DEMO_ANSWER

export interface PhoneDemoView {
  step: 0 | 1 | 2;
  outcome: "right" | "wrong";
  /** The choice the demo has tapped, as an index into DEMO_CHOICES. */
  tapped: number;
  /** Ren has marked it: the verdict shows. */
  marked: boolean;
  /** The next review is booked: the strip lights its day. */
  booked: boolean;
  /** One per progress segment. The active one fills over the step's four seconds. */
  segments: readonly ("done" | "active" | "todo")[];
  verdict: string;
  booking: string;
  /** The square on the phone strip (today, then 30 days) that lights, or null before it is booked. */
  bookedSquare: number | null;
}

/**
 * What the card shows on tick `tick` (one tick per step, so three per card). Reduced motion is the
 * finished right-answer state, whatever the tick: nothing moves and nothing is half done.
 */
export function phoneDemoView(tick: number, reduced: boolean): PhoneDemoView {
  const step = (reduced ? 2 : tick % 3) as 0 | 1 | 2;
  const right = reduced || Math.floor(tick / 3) % 2 === 0;
  const days = right ? FIRST_CORRECT_DAYS : FIRST_MISS_DAYS;
  const segments = [0, 1, 2].map((i) => (reduced || i < step ? "done" : i === step ? "active" : "todo")) as PhoneDemoView["segments"];
  return {
    step,
    outcome: right ? "right" : "wrong",
    tapped: right ? DEMO_ANSWER : WRONG_TAP,
    marked: step >= 1,
    booked: step >= 2,
    segments,
    verdict: right ? `Correct · ${whenText(days)}` : `Not quite · back ${whenText(days)}`,
    booking: right ? `Next review booked · day ${days}` : `Next review booked · ${whenText(days)}`,
    bookedSquare: step >= 2 ? days : null,
  };
}

/** Where a visitor who scrolls onto the page begins: the start of a right-answer cycle (every sixth tick), so the first card they see is marked correct. */
export const restartTick = (tick: number): number => Math.ceil(tick / 6) * 6;
