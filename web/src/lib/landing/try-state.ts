// What /try remembers: which card is showing and which option was picked on each. Pure, so the
// rules (one answer per card, answers survive switching tabs) are tested without a browser.
export interface TryState {
  tab: number;
  /** The option picked on each card, or null while it is unanswered. */
  picks: readonly (number | null)[];
  /** Whether the lesson has been played: the pinned bar shows from the first play too. */
  played: boolean;
  /** Whether the one-time nudge toward the lesson has been shown. */
  nudged: boolean;
}

export const INITIAL_TRY: TryState = { tab: 0, picks: [null, null, null], played: false, nudged: false };

/** Three cards and the Listen tab. Listen holds no card, so it has no pick. */
export const TAB_COUNT = 4;

const wrap = (i: number, n: number) => ((i % n) + n) % n;

export function selectTab(state: TryState, index: number): TryState {
  return { ...state, tab: wrap(index, TAB_COUNT) };
}

/** Records the answer. A card already answered, or an option that does not exist, changes nothing. */
export function pickOption(state: TryState, option: number): TryState {
  if (state.tab >= state.picks.length || state.picks[state.tab] !== null || option < 0 || option > 3) return state;
  return { ...state, picks: state.picks.map((p, i) => (i === state.tab ? option : p)) };
}

/** Clears the current card so it can be answered again. */
export function pickAgain(state: TryState): TryState {
  return { ...state, picks: state.picks.map((p, i) => (i === state.tab ? null : p)) };
}

/** Whether any card has been answered. */
export const anyPicked = (state: TryState): boolean => state.picks.some((p) => p !== null);

/** Whether every card has been answered. */
export const allPicked = (state: TryState): boolean => state.picks.every((p) => p !== null);

export const markPlayed = (state: TryState): TryState => (state.played ? state : { ...state, played: true });

export const markNudged = (state: TryState): TryState => (state.nudged ? state : { ...state, nudged: true });

/** The pinned bar shows from the first answer or the first play, and stays. */
export const showBar = (state: TryState): boolean => anyPicked(state) || state.played;

/** The tab a key on the tablist moves to, or null for a key that does nothing there. `count` is how many tabs are showing: three cards on a wide screen, four with Listen on a phone. */
export function tabForKey(state: Pick<TryState, "tab">, key: string, count: number = TAB_COUNT): number | null {
  const last = count - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return wrap(state.tab + 1, count);
  if (key === "ArrowLeft" || key === "ArrowUp") return wrap(state.tab - 1, count);
  if (key === "Home") return 0;
  if (key === "End") return last;
  return null;
}
