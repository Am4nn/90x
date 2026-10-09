import { describe, expect, it } from "vitest";
import { AddModelAnswer, addReason, chipsFor, clampAnswer, lastMessages, uniquePicks, withLeftOut } from "./add-rules";

describe("chipsFor", () => {
  const base = { lastSolved: null, weakestPattern: null, companies: [], plannedMinutesLeft: 90, localHour: 10 };
  it("shows only the chips that apply, in order, at most 4", () => {
    expect(chipsFor(base)).toEqual([]);
    expect(
      chipsFor({
        lastSolved: { title: "LRU Cache" },
        weakestPattern: "Sliding window",
        companies: ["Google", "Uber"],
        plannedMinutesLeft: 15,
        localHour: 10,
      }),
    ).toEqual(["Harder than LRU Cache", "More sliding window", "Asked at Google", "A quick 15-min one"]);
  });
  it("offers the quick one late in the day even with time left", () => {
    expect(chipsFor({ ...base, localHour: 21 })).toEqual(["A quick 15-min one"]);
  });
});

describe("lastMessages", () => {
  it("keeps the last 6", () => {
    expect(lastMessages([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([3, 4, 5, 6, 7, 8]);
  });
});

const p = (ref: string) => ({ kind: "problem" as const, ref, why: "x" });

describe("uniquePicks", () => {
  it("drops repeats and caps at 3", () => {
    expect(uniquePicks([p("a"), p("a"), p("b"), p("c"), p("d")]).map((x) => x.ref)).toEqual(["a", "b", "c"]);
  });
});

describe("addReason", () => {
  it("keeps the first part of the meta line", () => {
    expect(addReason("Graphs · medium · asked at Google")).toBe("Graphs · Added with Coach");
  });
});

describe("clampAnswer", () => {
  it("cuts long prose to the stored limits instead of refusing it, and keeps at most 3 distinct picks", () => {
    const parsed = AddModelAnswer.parse({
      say: "s".repeat(400),
      picks: [p("a"), { ...p("b"), why: "w".repeat(200) }, p("a"), p("c"), p("d")],
    });
    const out = clampAnswer(parsed);
    expect(out.say.length).toBeLessThanOrEqual(300);
    expect(out.picks.map((x) => x.ref)).toEqual(["a", "b", "c"]);
    expect(out.picks[1]!.why.length).toBeLessThanOrEqual(120);
  });
});

describe("withLeftOut", () => {
  it("leaves the text alone when nothing was dropped", () => {
    expect(withLeftOut("Two for you.", 2, 2)).toBe("Two for you.");
  });
  it("says how many were left out", () => {
    expect(withLeftOut("Swapped one.", 2, 1)).toBe("Swapped one. I left out one that's already on your list or done.");
    expect(withLeftOut("Three.", 3, 1)).toBe("Three. I left out 2 that are already on your list or done.");
  });
  it("says plainly when nothing can be added", () => {
    expect(withLeftOut("Here.", 1, 0)).toBe(
      "Here. None of those can be added: they're already on your list or done. Try asking for something else.",
    );
  });
});
