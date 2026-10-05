// The pinned demo: one Feed card is answered, Ren marks it, and the card is booked to
// come back. The page scrolls; this is what scroll position means. Pure, so the
// thresholds and the copy are tested without a browser.

/** How far through the pinned section the reader is: 0 as it reaches the top, 1 as it lets go. */
export function scrollProgress(sectionTop: number, sectionHeight: number, viewportHeight: number): number {
  return Math.max(0, Math.min(1, -sectionTop / Math.max(1, sectionHeight - viewportHeight)));
}

/** The progress at which the answer is picked, marked, and the card is booked. */
const PICKED_AT = 0.2;
const MARKED_AT = 0.45;
const BOOKED_AT = 0.68;

type DemoStage = 0 | 1 | 2;

export const DEMO_STEPS = ["Answer a card.", "Ren marks it.", "It comes back before you forget."] as const;
export const DEMO_CAPTIONS = ["Ren reads your answer.", "Marked correct.", "Back before you forget."] as const;

export const DEMO_QUESTION =
  "Your API retries failed calls instantly. When the database slows down, traffic triples and it falls over. What should the retries use?";
export const DEMO_CHOICES = ["A longer timeout", "Backoff with jitter", "More replicas", "A bigger pool"] as const;
/** The right answer, as an index into DEMO_CHOICES. */
export const DEMO_ANSWER = 1;

/**
 * The review strip, true to the app's scheduler (lib/feed/srs.ts): a wrong answer comes
 * back in 1 day, a right one in the Feed after 30 or more. A literal 31-day strip would be
 * 31 hairline squares, so the scale is broken: 15 squares, the first two are today and
 * tomorrow, the last is day 30, and the 12 between are drawn as a dashed gap ("time passes").
 * `days` are square positions (0 to 14), not day counts; `daysAhead` says what each stands for.
 */
const BOOKED = [
  { square: 1, daysAhead: 1, text: "+1" },
  { square: 14, daysAhead: 30, text: "+30" },
] as const;
export const REVIEW_STRIP = {
  squares: 15,
  /** The squares that light up when the card is booked: tomorrow, then a month on. */
  days: BOOKED.map((b) => b.square),
  /** The days ahead each lit square stands for, counted from today. */
  daysAhead: BOOKED.map((b) => b.daysAhead),
  /** Squares between the labelled ones, drawn dashed: the days that are skipped over. */
  gap: { from: 2, to: 13 },
  /** Labels sit under their squares: `day` is the square's position. */
  labels: [{ day: 0, text: "Today" }, ...BOOKED.map((b) => ({ day: b.square, text: b.text }))],
  caption: "Wrong answers return tomorrow. Right ones, a month later.",
} as const;

export interface DemoView {
  stage: DemoStage;
  /** "Backoff with jitter" is picked (cyan). */
  picked: boolean;
  /** Ren has marked it (green) and the verdict shows. */
  marked: boolean;
  /** The days (squares) that are lit by now. */
  lit: readonly number[];
}

/** What the card and the steps show at progress `sp`, 0 to 1. */
export function demoView(sp: number): DemoView {
  const stage: DemoStage = sp < MARKED_AT ? 0 : sp < BOOKED_AT ? 1 : 2;
  // Squares light one after another over the last third, each when its share of the strip has been reached.
  const booking = Math.max(0, (sp - BOOKED_AT) / (1 - BOOKED_AT));
  const lit = stage === 2 ? REVIEW_STRIP.days.filter((day) => booking >= day / REVIEW_STRIP.squares) : [];
  return { stage, picked: sp >= PICKED_AT, marked: sp >= MARKED_AT, lit };
}

/** The progress as a whole number of half-percents, so a scroll event that changes nothing visible changes nothing. */
export const quantize = (sp: number): number => Math.round(sp * 200);
export const unquantize = (steps: number): number => steps / 200;
