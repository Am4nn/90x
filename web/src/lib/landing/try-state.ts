// What /try remembers: which card is showing and which option was picked on each. Pure, so the
// rules (one answer per card, answers survive switching tabs) are tested without a browser.

export interface TryState {
  tab: number;
  /** The option picked on each card, or null while it is unanswered. */
  picks: readonly (number | null)[];
}

export const INITIAL_TRY: TryState = { tab: 0, picks: [null, null, null] };

const wrap = (i: number, n: number) => ((i % n) + n) % n;

export function selectTab(state: TryState, index: number): TryState {
  return { ...state, tab: wrap(index, state.picks.length) };
}

/** Records the answer. A card already answered, or an option that does not exist, changes nothing. */
export function pickOption(state: TryState, option: number): TryState {
  if (state.picks[state.tab] !== null || option < 0 || option > 3) return state;
  return { ...state, picks: state.picks.map((p, i) => (i === state.tab ? option : p)) };
}

/** Clears the current card so it can be answered again. */
export function pickAgain(state: TryState): TryState {
  return { ...state, picks: state.picks.map((p, i) => (i === state.tab ? null : p)) };
}

/** Whether any card has been answered: the pinned bar shows from the first answer and stays. */
export const anyPicked = (state: TryState): boolean => state.picks.some((p) => p !== null);

/** The tab a key on the tablist moves to, or null for a key that does nothing there. */
export function tabForKey(state: TryState, key: string): number | null {
  const last = state.picks.length - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return wrap(state.tab + 1, last + 1);
  if (key === "ArrowLeft" || key === "ArrowUp") return wrap(state.tab - 1, last + 1);
  if (key === "Home") return 0;
  if (key === "End") return last;
  return null;
}
