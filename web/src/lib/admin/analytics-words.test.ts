import { describe, expect, it } from "vitest";
import { dropOff, fillDays, windowDays } from "./analytics-math";
import {
  actionsCaption,
  areasCaption,
  changeWords,
  cohortCaption,
  dauCaption,
  demoCaption,
  funnelCaption,
  glance,
  lifetimeCaption,
  peopleCaption,
  reportsCaption,
  shareCaption,
  sourcesCaption,
  spendCaption,
} from "./analytics-words";

const days = (values: number[], today = "2026-10-28") =>
  fillDays(
    windowDays(values.length, today).map((day, i) => ({ day, n: values[i]! })),
    windowDays(values.length, today),
  );

describe("change in words", () => {
  it("signs the difference and names what it is compared with", () => {
    expect(changeWords(5, 9, "last Wednesday")).toEqual({ dir: "down", text: "−4 vs last Wednesday" });
    expect(changeWords(42, 4, "the 30 days before")).toEqual({ dir: "up", text: "+38 vs the 30 days before" });
    expect(changeWords(3, 3, "the 7 days before")).toEqual({ dir: "flat", text: "same as the 7 days before" });
  });
});

describe("people active each day", () => {
  it("names the launch peak when the launch post is in range", () => {
    const d = days([2, 3, 15, 12, 10, 9, 8, 9, 7, 8]);
    expect(dauCaption(d, "2026-10-21")).toBe("The launch post brought a peak of 15 people on 21 Oct. The last 7 days averaged 9 a day.");
  });
  it("names the busiest day otherwise", () => {
    expect(dauCaption(days([3, 5, 4]), null)).toBe("The busiest day had 5 people on 27 Oct. The last 7 days averaged 4 a day.");
  });
  it("says too few for a handful, and nobody for none", () => {
    expect(dauCaption(days([0, 1, 0, 2, 1, 0]), null)).toBe(
      "Too few to call a trend: someone was active on 3 days, never more than 2 a day.",
    );
    expect(dauCaption(days([0, 0, 0]), null)).toBe("Nobody was active in these 3 days.");
  });
});

describe("sign-up weeks", () => {
  it("reads the newest week whose second week is over", () => {
    const cohorts = [
      { week: "2026-10-05", size: 2, back: [1, 1, 0] },
      { week: "2026-10-12", size: 29, back: [9, 5, 0] },
      { week: "2026-10-19", size: 6, back: [2, 0, 0] },
    ];
    expect(cohortCaption(cohorts, "2026-10-28")).toBe("9 of 29 people who joined the week of 12 Oct came back the week after (31%).");
    expect(cohortCaption(cohorts.slice(0, 1), "2026-10-28")).toBe("1 of 2 people who joined the week of 5 Oct came back the week after.");
    expect(cohortCaption([{ week: "2026-10-26", size: 3, back: [0, 0, 0] }], "2026-10-28")).toBe(
      "Nobody has been here long enough to come back a week later.",
    );
  });
});

describe("actions per day", () => {
  const totals = {
    cards: { name: "Cards answered", n: 887 },
    missions: { name: "Missions done", n: 267 },
    lessons: { name: "Lessons opened", n: 184 },
    coach: { name: "Coach messages", n: 97 },
    mocks: { name: "Mock interviews", n: 2 },
  };
  it("names the main action per active person-day and what is barely used", () => {
    expect(actionsCaption(totals, 200, 30)).toBe(
      "Cards answered lead: about 4.4 per person on each day they were active. Mock interviews are barely used (2 in 30 days).",
    );
  });
  it("says so when there is nothing yet", () => {
    expect(actionsCaption({ cards: { name: "Cards answered", n: 0 } }, 0, 7)).toBe("Nothing to count yet in these 7 days.");
  });
});

describe("drop-off", () => {
  it("names the biggest leak", () => {
    const f = dropOff({ signedUp: 42, setup: 34, answered: 25, finished: 18, oldEnough: 33, cameBack: 9 });
    expect(funnelCaption(f.steps, f.worst, f.showPct, 30)).toBe(
      'The biggest leak is between "finished setup" and "answered a first card": 9 people stopped there.',
    );
  });
  it("gives counts for a handful", () => {
    const f = dropOff({ signedUp: 1, setup: 1, answered: 0, finished: 0, oldEnough: 0, cameBack: 0 });
    expect(funnelCaption(f.steps, f.worst, f.showPct, 7)).toBe(
      '1 person signed up. 1 stopped before "answered a first card". Percentages show from 5 people.',
    );
    const none = dropOff({ signedUp: 0, setup: 0, answered: 0, finished: 0, oldEnough: 0, cameBack: 0 });
    expect(funnelCaption(none.steps, none.worst, none.showPct, 7)).toBe("Nobody signed up in these 7 days.");
  });
});

describe("areas", () => {
  it("names the biggest area and the least accurate one with enough answers", () => {
    const rows = [
      { key: "dsa" as const, label: "DSA", n: 42, correct: 30, pct: 71 },
      { key: "system_design" as const, label: "System design", n: 24, correct: 14, pct: 58 },
      { key: "sql" as const, label: "SQL", n: 4, correct: 1, pct: 25 },
    ];
    expect(areasCaption(rows, 30)).toBe(
      "DSA gets 60% of all answers. System design is where people miss most (58% right): the place to check card quality first.",
    );
    expect(areasCaption(rows.slice(0, 1), 30)).toBe("DSA gets 100% of all answers.");
    expect(areasCaption([{ ...rows[0]!, n: 50, pct: 40 }, rows[1]!], 30)).toBe(
      "DSA gets 68% of all answers and is where people miss most (40% right): the place to check card quality first.",
    );
    expect(areasCaption([], 7)).toBe("No Feed answers in these 7 days.");
  });
});

describe("sources and sharing", () => {
  it("names the biggest source and the invites", () => {
    const rows = [
      { name: "LinkedIn", n: 24 },
      { name: "Invite links", n: 7 },
      { name: "Direct", n: 6 },
    ];
    expect(sourcesCaption(rows, 7, 30)).toBe("LinkedIn brought 24 of 37 sign-ups. Invite links from the share card brought 7.");
    expect(sourcesCaption([{ name: "LinkedIn", n: 0 }], 0, 7)).toBe("No sign-ups in these 7 days.");
    expect(shareCaption(11, 7, 30)).toBe("11 people made a share card and 7 friends joined through an invite link.");
    expect(shareCaption(0, 0, 7)).toBe("Nobody made a share card or joined through one in these 7 days.");
  });
});

describe("cost and health", () => {
  it("splits readers from system jobs and counts days over the cap", () => {
    const daily = [
      { readers: 0.5, builds: 2.6 },
      { readers: 0.3, builds: 0 },
    ];
    expect(spendCaption(daily, 4, 3, 7)).toBe(
      "$3.40 in 7 days. Readers cost $0.80 (about $0.20 per active person); system jobs and admins $2.60. 1 day crossed the $3.00 cap.",
    );
    expect(spendCaption([{ readers: 0, builds: 0 }], 0, 3, 7)).toBe("No AI spend in these 7 days.");
  });
  it("says how far the lifetime ceiling is", () => {
    expect(lifetimeCaption(41.27, 105, 4.2)).toBe("39% used. At the last 30 days' pace the ceiling is about 4 months away.");
    expect(lifetimeCaption(10, 105, null)).toBe("10% used. Nothing was spent in the last 30 days.");
    expect(lifetimeCaption(105, 105, 0)).toMatch(/^100% used\. The ceiling is reached/);
  });
  it("counts reports and the ones waiting", () => {
    expect(reportsCaption(5, 2, 30)).toBe("5 reports in 30 days. 2 are waiting for you.");
    expect(reportsCaption(1, 1, 7)).toBe("1 report in 7 days. 1 is waiting for you.");
    expect(reportsCaption(0, 0, 7)).toBe("No reports in these 7 days. None is waiting.");
  });
});

describe("people and the glance", () => {
  it("says how far in today's regulars are", () => {
    expect(
      peopleCaption([
        { dayN: 3, answers7: 12 },
        { dayN: 30, answers7: 0 },
        { dayN: null, answers7: 0 },
      ]),
    ).toBe("1 of these 3 are in their first three weeks; 2 answered no cards in the last 7 days.");
    expect(peopleCaption([])).toBe("Nobody has done anything real yet.");
  });
  it("puts one sentence per question at the top", () => {
    expect(
      glance({
        wau: 19,
        wauPrev: 24,
        signups: 42,
        range: 30,
        gate: { returners: 6, target: 20, by: "2026-11-11" },
        leak: 'between "finished setup" and "answered a first card"',
        lifetime: 41.27,
        cap: 105,
      }),
    ).toEqual([
      "19 people used 90x in the last 7 days, 5 fewer than the week before.",
      "42 people signed up in the last 30 days.",
      "Week-2 returners: 6 of the 20 the launch gate wants by 11 Nov.",
      'Biggest leak: between "finished setup" and "answered a first card".',
      "AI spend is at $41.27 of $105.00.",
    ]);
  });
});

describe("demoCaption", () => {
  it("says so when nobody visited", () => {
    expect(demoCaption({ visits: 0, answered: [0, 0, 0], listens: { started: 0, finished: 0 }, signinClicks: 0 })).toBe("No visits yet.");
  });
  it("sums up the funnel in a sentence", () => {
    expect(demoCaption({ visits: 3, answered: [2, 1, 0], listens: { started: 1, finished: 1 }, signinClicks: 1 })).toBe(
      "Of 3 visits, 2 answered a card and 1 listened to the lesson; 1 pressed sign in.",
    );
  });
  it("pluralises", () => {
    expect(demoCaption({ visits: 1, answered: [0, 0, 0], listens: { started: 0, finished: 0 }, signinClicks: 0 })).toBe(
      "Of 1 visit, 0 answered a card and 0 listened to the lesson; 0 pressed sign in.",
    );
  });
});
