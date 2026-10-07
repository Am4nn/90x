import { describe, expect, it } from "vitest";
import { anyPicked, INITIAL_TRY, pickAgain, pickOption, selectTab, tabForKey } from "./try-state";

describe("try state", () => {
  it("starts on the first card with nothing answered", () => {
    expect(INITIAL_TRY).toEqual({ tab: 0, picks: [null, null, null] });
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
    expect(s).toEqual({ tab: 0, picks: [1, 3, null] });
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
    expect(selectTab(INITIAL_TRY, 3).tab).toBe(0);
    expect(selectTab(INITIAL_TRY, -1).tab).toBe(2);
    expect(pickOption(INITIAL_TRY, 7)).toBe(INITIAL_TRY);
    expect(pickOption(INITIAL_TRY, -1)).toBe(INITIAL_TRY);
  });

  it("maps the tablist keys", () => {
    expect(tabForKey(INITIAL_TRY, "ArrowRight")).toBe(1);
    expect(tabForKey(INITIAL_TRY, "ArrowDown")).toBe(1);
    expect(tabForKey(INITIAL_TRY, "ArrowLeft")).toBe(2);
    expect(tabForKey(INITIAL_TRY, "ArrowUp")).toBe(2);
    expect(tabForKey(selectTab(INITIAL_TRY, 1), "Home")).toBe(0);
    expect(tabForKey(INITIAL_TRY, "End")).toBe(2);
    expect(tabForKey(INITIAL_TRY, "Enter")).toBeNull();
  });
});
