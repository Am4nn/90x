import { describe, expect, it } from "vitest";
import {
  ANALYTICS_VERSION,
  accuracy,
  safeZone,
  activation,
  analyticsCacheKey,
  cohortCell,
  demoFromCounts,
  demoFunnel,
  dropOff,
  SECOND_MIDPOINTS,
  medianSeconds,
  fillDays,
  foldAreas,
  formatMinutes,
  isActiveOutcome,
  isCachedFor,
  isActivatingOutcome,
  isMature,
  isTestEmail,
  lastSeen,
  launchGate,
  localDay,
  maskEmail,
  median,
  mondayOf,
  monthsToCeiling,
  parseRange,
  pct,
  ratioText,
  returnRate,
  stickiness,
  weeklySeries,
  windowDays,
} from "./analytics-math";

describe("range", () => {
  it("accepts 7, 30 and 90 and falls back to 30", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange(["90"])).toBe(90);
    expect(parseRange("45")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
  });

  it("lists the window oldest first, ending today, across a month end", () => {
    expect(windowDays(3, "2026-03-01")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });

  it("zero-fills days with no rows and ignores days outside the window", () => {
    const days = windowDays(3, "2026-10-05");
    expect(
      fillDays(
        [
          { day: "2026-10-04", n: 2 },
          { day: "2026-09-01", n: 9 },
        ],
        days,
      ),
    ).toEqual([
      { day: "2026-10-03", n: 0 },
      { day: "2026-10-04", n: 2 },
      { day: "2026-10-05", n: 0 },
    ]);
  });
});

describe("local day bucketing", () => {
  it("puts the same instant on different days for different zones", () => {
    const at = new Date("2026-10-04T20:00:00Z");
    expect(localDay(at, "UTC")).toBe("2026-10-04");
    expect(localDay(at, "Asia/Kolkata")).toBe("2026-10-05");
    expect(localDay(at, "America/Los_Angeles")).toBe("2026-10-04");
  });

  it("uses UTC when the zone is missing or not a zone", () => {
    const at = new Date("2026-10-04T23:30:00Z");
    expect(localDay(at, null)).toBe("2026-10-04");
    expect(localDay(at, "")).toBe("2026-10-04");
    expect(localDay(at, "Not/AZone")).toBe("2026-10-04");
  });
});

describe("what counts", () => {
  it("counts every outcome but the two declarations as active", () => {
    expect(["correct", "wrong", "skipped"].every(isActiveOutcome)).toBe(true);
    expect(isActiveOutcome("new_to_me")).toBe(false);
    expect(isActiveOutcome("known")).toBe(false);
  });

  it("activates only on a right or wrong answer", () => {
    expect(isActivatingOutcome("correct")).toBe(true);
    expect(isActivatingOutcome("wrong")).toBe(true);
    expect(["skipped", "new_to_me", "known"].some(isActivatingOutcome)).toBe(false);
  });

  it("drops the e2e test accounts", () => {
    expect(isTestEmail("Admin-1@E2E.test")).toBe(true);
    expect(isTestEmail("a@example.com")).toBe(false);
    expect(isTestEmail(null)).toBe(false);
  });
});

describe("rates", () => {
  it("is a dash, not 0%, when there is nothing to divide by", () => {
    expect(pct(0, 0)).toBeNull();
    expect(ratioText(activation(0, 0))).toBe("no data yet");
  });

  it("shows the count beside the percentage", () => {
    expect(ratioText(activation(3, 8))).toBe("3 of 8 (38%)");
    expect(ratioText(activation(1, 1))).toBe("1 of 1 (100%)");
  });

  it("leaves skips out of accuracy", () => {
    expect(accuracy(3, 1).pct).toBe(75);
    expect(accuracy(0, 0).pct).toBeNull();
  });

  it("takes the median of odd, even and empty lists", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("measures stickiness as average daily actives over weekly actives", () => {
    expect(stickiness([2, 2, 2, 2, 2, 2, 2], 4)).toBe(50);
    expect(stickiness([7, 0, 0, 0, 0, 0, 0], 7)).toBe(14);
    expect(stickiness([], 0)).toBeNull();
  });

  it("reads minutes the way a person would", () => {
    expect(formatMinutes(null)).toBe("none yet");
    expect(formatMinutes(0.2)).toBe("under a minute");
    expect(formatMinutes(42)).toBe("42 min");
    expect(formatMinutes(190)).toBe("3 h 10 min");
    expect(formatMinutes(52 * 60)).toBe("2 d 4 h");
  });
});

describe("day-N return", () => {
  const today = "2026-10-10";

  it("judges a cohort only once its Nth day has fully passed", () => {
    expect(isMature("2026-10-09", 1, today)).toBe(false);
    expect(isMature("2026-10-08", 1, today)).toBe(true);
    expect(isMature("2026-10-03", 7, today)).toBe(false);
    expect(isMature("2026-10-02", 7, today)).toBe(true);
  });

  it("counts returns over mature cohorts only, so a young cohort is not a failure", () => {
    const cohorts = [
      { day: "2026-10-01", size: 5, d1: 2, d7: 1 },
      { day: "2026-10-08", size: 3, d1: 1, d7: 0 },
      { day: "2026-10-09", size: 4, d1: 4, d7: 4 },
    ];
    expect(returnRate(cohorts, 1, today)).toEqual({ part: 3, whole: 8, pct: 38 });
    expect(returnRate(cohorts, 7, today)).toEqual({ part: 1, whole: 5, pct: 20 });
  });

  it("handles a cohort of one and no cohorts", () => {
    expect(returnRate([{ day: "2026-10-01", size: 1, d1: 1, d7: 0 }], 1, today)).toEqual({ part: 1, whole: 1, pct: 100 });
    expect(returnRate([], 7, today)).toEqual({ part: 0, whole: 0, pct: null });
  });

  it("crosses a month end when finding the Nth day", () => {
    expect(isMature("2026-09-30", 7, "2026-10-07")).toBe(false);
    expect(isMature("2026-09-30", 7, "2026-10-08")).toBe(true);
  });
});

const gate = (today: string, returners: number) => launchGate({ launchDate: "2026-10-12", today, returners });

describe("launch gate", () => {
  it("day 0 is the launch day: pace 0, so zero returners is on track", () => {
    expect(gate("2026-10-12", 0)).toEqual({ dayOf30: 0, returners: 0, pace: 0, state: "on-track" });
  });

  it("a launch date in the future counts as day 0 and never goes negative", () => {
    expect(gate("2026-10-05", 0)).toEqual({ dayOf30: 0, returners: 0, pace: 0, state: "on-track" });
  });

  it("pace is 0 through day 7, so zero returners is on track before one can exist", () => {
    for (let d = 12; d <= 19; d++) expect(gate(`2026-10-${d}`, 0)).toEqual({ dayOf30: d - 12, returners: 0, pace: 0, state: "on-track" });
    expect(gate("2026-10-18", 0)).toMatchObject({ dayOf30: 6, pace: 0, state: "on-track" });
  });

  it("then paces linearly, rounding up: day 8 is 1, day 9 is 2, day 15 is 7, day 30 is 20", () => {
    expect(gate("2026-10-20", 0).pace).toBe(1);
    expect(gate("2026-10-21", 0).pace).toBe(2);
    expect(gate("2026-10-27", 0).pace).toBe(7);
    expect(gate("2026-11-11", 0).pace).toBe(20);
  });

  it("exactly on pace is on track; one under is behind (day 9, pace 2)", () => {
    expect(gate("2026-10-21", 2).state).toBe("on-track");
    expect(gate("2026-10-21", 1).state).toBe("behind");
    expect(gate("2026-10-21", 7)).toMatchObject({ dayOf30: 9, pace: 2, state: "on-track" });
  });

  it("being past the target before the window ends is still on track", () => {
    expect(gate("2026-10-21", 25).state).toBe("on-track");
    expect(gate("2026-11-10", 20).state).toBe("on-track");
  });

  it("day 29 is still open", () => {
    expect(gate("2026-11-10", 19)).toMatchObject({ dayOf30: 29, pace: 20, state: "behind" });
  });

  it("day 30 closes the window: below the target is closed-below, at the target is closed-met", () => {
    expect(gate("2026-11-11", 19)).toMatchObject({ dayOf30: 30, pace: 20, state: "closed-below" });
    expect(gate("2026-11-11", 20)).toMatchObject({ dayOf30: 30, state: "closed-met" });
  });

  it("day 31 and later stay closed and the day stops at 30", () => {
    expect(gate("2026-11-12", 7)).toMatchObject({ dayOf30: 30, pace: 20, state: "closed-below" });
    expect(gate("2027-03-01", 21)).toMatchObject({ dayOf30: 30, state: "closed-met" });
  });
});

describe("dashboard cache", () => {
  it("keys on the payload version, the range, the launch date and the viewer's time zone", () => {
    expect(analyticsCacheKey(30, "2026-10-14", "Asia/Kolkata")).toBe(`90x:analytics:v${ANALYTICS_VERSION}:30:2026-10-14:Asia/Kolkata`);
    expect(analyticsCacheKey(30, null)).toBe(`90x:analytics:v${ANALYTICS_VERSION}:30:no-launch:UTC`);
    expect(analyticsCacheKey(30, null, "Asia/Kolkata")).not.toBe(analyticsCacheKey(30, null, "UTC"));
    expect(analyticsCacheKey(30, "2026-10-14")).not.toBe(analyticsCacheKey(30, "2026-10-15"));
    expect(analyticsCacheKey(7, null)).not.toBe(analyticsCacheKey(30, null));
  });
  const v = ANALYTICS_VERSION;
  it("serves a hit only for the same version, range and launch date", () => {
    expect(isCachedFor({ version: v, range: 30, gate: { launchDate: "2026-10-14" } }, 30, "2026-10-14")).toBe(true);
    expect(isCachedFor({ version: v, range: 30, gate: { launchDate: "2026-10-14" } }, 30, "2026-10-20")).toBe(false);
    expect(isCachedFor({ version: v, range: 30, gate: { launchDate: "2026-10-14" } }, 30, null)).toBe(false);
    expect(isCachedFor({ version: v, range: 7, gate: null }, 30, null)).toBe(false);
    expect(isCachedFor({ version: v, range: 30, gate: null }, 30, null)).toBe(true);
  });
  it("drops a payload of an older shape, whatever its range and date", () => {
    expect(isCachedFor({ range: 30 }, 30, null)).toBe(false);
    expect(isCachedFor({ version: v - 1, range: 30, gate: null }, 30, null)).toBe(false);
    expect(isCachedFor(null, 30, null)).toBe(false);
  });
});

describe("masked emails", () => {
  it("keeps the first letter and the domain, hides the rest with up to six dots", () => {
    expect(maskEmail("rahul.k@gmail.com")).toBe("r••••••@gmail.com");
    expect(maskEmail("averyverylongname@iitb.ac.in")).toBe("a••••••@iitb.ac.in");
    expect(maskEmail("ab@x.io")).toBe("a••@x.io");
  });
  it("never shows a whole address, even an odd one", () => {
    expect(maskEmail("a@x.io")).toBe("a••@x.io");
    expect(maskEmail("@x.io")).toBe("•••@x.io");
    expect(maskEmail("no-at-sign")).toBe("n•••");
    expect(maskEmail(null)).toBe("unknown");
    expect(maskEmail("")).toBe("unknown");
  });
});

describe("weeks", () => {
  it("finds the Monday a week starts on", () => {
    expect(mondayOf("2026-10-28")).toBe("2026-10-26"); // Wednesday
    expect(mondayOf("2026-10-26")).toBe("2026-10-26"); // Monday
    expect(mondayOf("2026-11-01")).toBe("2026-10-26"); // Sunday
  });
  it("lays weekly buckets out oldest first, 0 where a week had nobody", () => {
    expect(
      weeklySeries(
        [
          { w: 0, n: 5 },
          { w: 2, n: 3 },
        ],
        4,
      ),
    ).toEqual([0, 3, 0, 5]);
    expect(weeklySeries([{ w: 9, n: 1 }], 2)).toEqual([0, 0]);
  });
});

describe("sign-up week cohorts", () => {
  // Joined the week of Mon 12 Oct. Week 2 is 19-25 Oct, week 3 is 26 Oct - 1 Nov, week 4 is 2-8 Nov.
  it("is not yet before the week starts, so far while it runs, and done after", () => {
    expect(cohortCell("2026-10-12", 1, "2026-10-18", 0, 29).state).toBe("not-yet");
    expect(cohortCell("2026-10-12", 1, "2026-10-19", 2, 29)).toEqual({ state: "running", back: 2, pct: 7 });
    expect(cohortCell("2026-10-12", 1, "2026-10-25", 9, 29).state).toBe("running");
    expect(cohortCell("2026-10-12", 1, "2026-10-26", 9, 29)).toEqual({ state: "done", back: 9, pct: 31 });
    expect(cohortCell("2026-10-12", 3, "2026-10-28", 0, 29).state).toBe("not-yet");
  });
  it("shows counts only for a group under five people", () => {
    expect(cohortCell("2026-09-21", 1, "2026-10-28", 1, 3)).toEqual({ state: "done", back: 1, pct: null });
    expect(cohortCell("2026-09-21", 1, "2026-10-28", 3, 5)).toEqual({ state: "done", back: 3, pct: 60 });
  });
});

describe("drop-off funnel", () => {
  const counts = { signedUp: 42, setup: 34, answered: 25, finished: 18, oldEnough: 33, cameBack: 9 };
  it("lists the steps with the share of the step before, and the last step over the people old enough", () => {
    const f = dropOff(counts);
    expect(f.steps.map((s) => [s.name, s.n, s.pct])).toEqual([
      ["Signed up", 42, null],
      ["Finished setup", 34, 81],
      ["Answered a first card", 25, 74],
      ["Finished a first day", 18, 72],
      ["Came back after 7 days", 9, 27],
    ]);
    expect(f.steps[4]!.of).toBe(33);
    expect(f.showPct).toBe(true);
  });
  it("marks the biggest drop between the first four steps", () => {
    expect(dropOff(counts).worst).toBe(2);
    expect(dropOff({ ...counts, setup: 20, answered: 15, finished: 10 }).worst).toBe(1);
    expect(dropOff({ signedUp: 6, setup: 6, answered: 6, finished: 6, oldEnough: 0, cameBack: 0 }).worst).toBeNull();
  });
  it("has no last-step number while nobody is old enough, and no percentages under five people", () => {
    const f = dropOff({ signedUp: 1, setup: 1, answered: 0, finished: 0, oldEnough: 0, cameBack: 0 });
    expect(f.steps[4]!.n).toBeNull();
    expect(f.showPct).toBe(false);
  });
});

describe("answers by area", () => {
  it("folds the small areas into Other, keeps a fixed order and leaves out empty areas", () => {
    const rows = foldAreas([
      { area: "lld", correct: 1, wrong: 1 },
      { area: "sql", correct: 7, wrong: 3 },
      { area: "dsa", correct: 30, wrong: 10 },
      { area: "behavioral", correct: 1, wrong: 0 },
      { area: null, correct: 0, wrong: 1 },
      { area: "java", correct: 0, wrong: 0 },
    ]);
    expect(rows.map((r) => [r.key, r.n, r.pct])).toEqual([
      ["dsa", 40, 75],
      ["sql", 10, 70],
      ["other", 4, 50],
    ]);
    expect(rows[2]!.label).toBe("Other (LLD, AI, behavioural)");
  });
});

describe("money and time", () => {
  it("says how many months of the ceiling are left at the last 30 days' pace", () => {
    expect(monthsToCeiling(41.27, 105, 15)).toBeCloseTo(4.25, 2);
    expect(monthsToCeiling(10, 105, 0)).toBeNull();
    expect(monthsToCeiling(105, 105, 3)).toBe(0);
    expect(monthsToCeiling(110, 105, 3)).toBe(0);
  });
  it("says when someone was last seen, in the viewer's time zone", () => {
    const now = new Date("2026-10-28T09:40:00Z"); // 15:10 in Kolkata
    const tz = "Asia/Kolkata";
    expect(lastSeen("2026-10-28T09:39:40Z", now, tz)).toBe("just now");
    expect(lastSeen("2026-10-28T09:28:00Z", now, tz)).toBe("12 min ago");
    expect(lastSeen("2026-10-28T04:40:00Z", now, tz)).toBe("5 h ago");
    expect(lastSeen("2026-10-27T10:00:00Z", now, tz)).toBe("yesterday");
    expect(lastSeen("2026-10-26T10:00:00Z", now, tz)).toBe("Mon 26 Oct");
    // 18:00Z on the 27th is 23:30 on the 27th in Kolkata: yesterday there, not "15 h ago".
    expect(lastSeen("2026-10-27T18:00:00Z", now, tz)).toBe("yesterday");
  });
});

describe("safeZone", () => {
  it("keeps a real zone and falls back to UTC for a missing or unknown one", () => {
    expect(safeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(safeZone("")).toBe("UTC");
    expect(safeZone(null)).toBe("UTC");
    expect(safeZone("Mars/Olympus")).toBe("UTC");
  });
});

const e = (visit: string, kind: string, data: unknown = {}) => ({ visit, kind, data });

describe("demoFunnel", () => {
  const rows = [
    e("a", "view"),
    e("a", "answer", { card: "sd", option: 1, correct: true }),
    e("a", "answer", { card: "dsa", option: 0, correct: false }),
    e("b", "view"),
    e("b", "listen_start"),
    e("b", "listen_95"),
    e("c", "view"),
    e("c", "signin_click", { spot: "top" }),
  ];

  it("folds visits, distinct cards answered, listens, sign-in clicks and the furthest step", () => {
    const d = demoFunnel(rows);
    expect(d.visits).toBe(3);
    expect(d.answered).toEqual([1, 1, 0]);
    expect(d.listens).toEqual({ started: 1, finished: 1 });
    expect(d.signinClicks).toBe(1);
    expect(d.leaveSteps).toEqual({ viewed: 0, answered: 1, listened: 1, signed_in: 1 });
  });

  it("counts visits by how many distinct cards they answered, and repeats of one card once", () => {
    const d = demoFunnel([
      e("a", "answer", { card: "sd", option: 1, correct: true }),
      e("a", "answer", { card: "sd", option: 2, correct: false }),
      e("b", "answer", { card: "sd", option: 1, correct: true }),
      e("b", "answer", { card: "dsa", option: 1, correct: true }),
      e("b", "answer", { card: "sql", option: 1, correct: false }),
    ]);
    expect(d.answered).toEqual([2, 1, 1]);
  });

  it("scores each card by each visit's first answer to it", () => {
    const d = demoFunnel([
      e("a", "answer", { card: "sd", option: 1, correct: false }),
      e("a", "answer", { card: "sd", option: 2, correct: true }),
      e("b", "answer", { card: "sd", option: 1, correct: true }),
    ]);
    expect(d.correct.sd).toEqual({ part: 1, whole: 2, pct: 50 });
    expect(d.correct.dsa).toEqual({ part: 0, whole: 0, pct: null });
  });

  it("is all zeros with no events and ignores malformed answer data", () => {
    expect(demoFunnel([]).visits).toBe(0);
    expect(demoFunnel([]).leaveSteps).toEqual({ viewed: 0, answered: 0, listened: 0, signed_in: 0 });
    const d = demoFunnel([e("a", "answer", null), e("a", "answer", { card: "nope" })]);
    expect(d.answered).toEqual([0, 0, 0]);
    expect(d.leaveSteps.answered).toBe(1);
  });
});

describe("medianSeconds", () => {
  it("has a midpoint for every bucket", () => {
    expect(SECOND_MIDPOINTS).toEqual({ "0-10": 5, "10-30": 20, "30-60": 45, "60-120": 90, "120-300": 210, "300+": 300 });
  });
  it("is the median of the leave buckets' midpoints, null with none", () => {
    expect(medianSeconds([])).toBeNull();
    expect(medianSeconds([{ seconds: "10-30" }, { seconds: "60-120" }, { seconds: "0-10" }])).toBe(20);
    expect(medianSeconds([{ seconds: "10-30" }, { seconds: "60-120" }])).toBe(55);
  });
  it("skips rows without a known bucket", () => {
    expect(medianSeconds([{ seconds: "bogus" }, null, { seconds: "300+" }])).toBe(300);
    expect(medianSeconds([null])).toBeNull();
  });
});

describe("demoFromCounts", () => {
  it("is the empty fold with no row (a failed query empties only the section)", () => {
    expect(demoFromCounts(undefined)).toEqual(demoFunnel([]));
  });

  it("maps Postgres's one row (bigints as strings, json maps) into the section's shape", () => {
    const d = demoFromCounts({
      visits: "7",
      answered1: "4",
      answered2: 2,
      answered3: "1",
      started: "3",
      finished: 1,
      signin_clicks: "2",
      cards: { sd: { seen: "3", right: "1" }, sql: { seen: 1, right: 1 }, nope: { seen: 9, right: 9 } },
      steps: { viewed: "2", answered: 2, signed_in: "3", bogus: 5 },
      median_seconds: 67.5,
    });
    expect(d).toEqual({
      visits: 7,
      answered: [4, 2, 1],
      correct: {
        sd: { part: 1, whole: 3, pct: 33 },
        dsa: { part: 0, whole: 0, pct: null },
        sql: { part: 1, whole: 1, pct: 100 },
      },
      listens: { started: 3, finished: 1 },
      signinClicks: 2,
      leaveSteps: { viewed: 2, answered: 2, listened: 0, signed_in: 3 },
      medianSeconds: 67.5,
    });
  });

  it("keeps a null median and tolerates null maps", () => {
    const d = demoFromCounts({
      visits: 1,
      answered1: 0,
      answered2: 0,
      answered3: 0,
      started: 0,
      finished: 0,
      signin_clicks: 0,
      cards: null,
      steps: null,
      median_seconds: null,
    });
    expect(d.medianSeconds).toBeNull();
    expect(d.correct.sd).toEqual({ part: 0, whole: 0, pct: null });
    expect(d.leaveSteps).toEqual({ viewed: 0, answered: 0, listened: 0, signed_in: 0 });
  });
});
