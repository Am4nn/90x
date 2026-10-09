import { describe, expect, it } from "vitest";
import {
  allPicked,
  anyPicked,
  INITIAL_TRY,
  markNudged,
  markPlayed,
  pickAgain,
  pickOption,
  selectTab,
  showBar,
  TAB_COUNT,
  tabForKey,
} from "./try-state";

describe("try state", () => {
  it("starts on the first card with nothing answered", () => {
    expect(INITIAL_TRY).toEqual({ tab: 0, picks: [null, null, null], played: false, nudged: false });
    expect(anyPicked(INITIAL_TRY)).toBe(false);
  });

  it("records an answer once; a second click on the same card changes nothing", () => {
    const first = pickOption(INITIAL_TRY, 2);
    expect(first.picks).toEqual([2, null, null]);
    expect(pickOption(first, 0)).toBe(first);
    expect(anyPicked(first)).toBe(true);
  });

  it("keeps each card's answer when the tab changes and comes back", () => {
    let s = pickOption(INITIAL_TRY, 1);
    s = selectTab(s, 1);
    s = pickOption(s, 3);
    s = selectTab(s, 0);
    expect(s).toEqual({ tab: 0, picks: [1, 3, null], played: false, nudged: false });
  });

  it("clears only the current card on Pick again, and the bar goes with the last answer", () => {
    let s = pickOption(selectTab(pickOption(INITIAL_TRY, 1), 1), 0);
    s = pickAgain(s);
    expect(s.picks).toEqual([1, null, null]);
    expect(s.tab).toBe(1);
    expect(anyPicked(s)).toBe(true);
    expect(anyPicked(pickAgain(selectTab(s, 0)))).toBe(false);
  });

  it("wraps tabs round, and ignores an out-of-range option", () => {
    expect(selectTab(INITIAL_TRY, 4).tab).toBe(0);
    expect(selectTab(INITIAL_TRY, -1).tab).toBe(3);
    expect(pickOption(INITIAL_TRY, 7)).toBe(INITIAL_TRY);
    expect(pickOption(INITIAL_TRY, -1)).toBe(INITIAL_TRY);
  });

  it("maps the tablist keys", () => {
    expect(tabForKey(INITIAL_TRY, "ArrowRight")).toBe(1);
    expect(tabForKey(INITIAL_TRY, "ArrowDown")).toBe(1);
    expect(tabForKey(INITIAL_TRY, "ArrowLeft")).toBe(3);
    expect(tabForKey(INITIAL_TRY, "ArrowUp")).toBe(3);
    expect(tabForKey(selectTab(INITIAL_TRY, 1), "Home")).toBe(0);
    expect(tabForKey(INITIAL_TRY, "End")).toBe(3);
    expect(tabForKey(INITIAL_TRY, "Enter")).toBeNull();
  });
});

describe("try state: the Listen tab and play", () => {
  it("has four tabs; the fourth is Listen and holds no card", () => {
    expect(TAB_COUNT).toBe(4);
    expect(selectTab(INITIAL_TRY, 3).tab).toBe(3);
    expect(selectTab(INITIAL_TRY, 4).tab).toBe(0);
    expect(pickOption(selectTab(INITIAL_TRY, 3), 0)).toEqual(selectTab(INITIAL_TRY, 3));
  });
  it("shows the bar from the first answer or the first play, and keeps it", () => {
    expect(showBar(INITIAL_TRY)).toBe(false);
    expect(showBar(markPlayed(INITIAL_TRY))).toBe(true);
    expect(showBar(pickOption(INITIAL_TRY, 1))).toBe(true);
  });
  it("knows when every card is answered", () => {
    let s = pickOption(INITIAL_TRY, 0);
    s = pickOption(selectTab(s, 1), 0);
    expect(allPicked(s)).toBe(false);
    s = pickOption(selectTab(s, 2), 0);
    expect(allPicked(s)).toBe(true);
  });
  it("the nudge shows once", () => {
    const s = markNudged(INITIAL_TRY);
    expect(s.nudged).toBe(true);
    expect(markNudged(s)).toBe(s);
  });
  it("arrow keys wrap over four tabs", () => {
    expect(tabForKey(selectTab(INITIAL_TRY, 3), "ArrowRight")).toBe(0);
    expect(tabForKey(INITIAL_TRY, "End")).toBe(3);
  });
  it("arrow keys wrap over the count of tabs showing", () => {
    expect(tabForKey(selectTab(INITIAL_TRY, 2), "ArrowRight", 3)).toBe(0);
    expect(tabForKey(INITIAL_TRY, "End", 3)).toBe(2);
    expect(tabForKey({ tab: 0 }, "ArrowLeft", 3)).toBe(2);
  });
});
