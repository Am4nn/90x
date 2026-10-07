import type { Settings } from "@/lib/settings-rules";

// When AI features run, slow down or stop. Pure, so the thresholds are tested on their
// own; guard.ts reads the settings and the meters and asks these.

/** Where spend stands against a cap: warn from 80%, over from 100%, stop from 200%. */
export type Level = "ok" | "warn" | "over" | "stop";
const WARN_AT = 0.8;
const STOP_AT = 2;
// Dollar amounts are floats: 0.8 of 3 is 2.4000000000000004, which would leave exactly 2.40 a hair short of the line.
const EPSILON = 1e-9;

export function level(spent: number, cap: number): Level {
  const s = spent + EPSILON;
  if (s >= cap * STOP_AT) return "stop";
  if (s >= cap) return "over";
  if (s >= cap * WARN_AT) return "warn";
  return "ok";
}

/** The lifetime cap is a ceiling, not a soft line: warn from 80%, stop at 100%. */
export function lifetimeLevel(spent: number, cap: number): "ok" | "warn" | "stop" {
  const s = spent + EPSILON;
  if (s >= cap) return "stop";
  if (s >= cap * WARN_AT) return "warn";
  return "ok";
}

export type Spend = { day: number; month: number; userDay: number; lifetime: number };

export type Verdict =
  /** `degrade`: past a cap but not stopped, so the Coach drops to the lighter model. */
  { allowed: true; degrade: boolean } | { allowed: false; reason: "paused" | "lifetime" | "stopped" | "user-cap" | "maintenance" };

const pastCap = (l: Level) => l === "over" || l === "stop";

export function decide(settings: Settings, spend: Spend): Verdict {
  if (settings.aiPaused) return { allowed: false, reason: "paused" };
  // The ceiling holds whatever the hard-stop switch says: that switch is for the daily and monthly lines.
  if (lifetimeLevel(spend.lifetime, settings.aiLifetimeCapUsd) === "stop") return { allowed: false, reason: "lifetime" };
  if (spend.userDay >= settings.aiUserDailyCapUsd) return { allowed: false, reason: "user-cap" };
  const day = level(spend.day, settings.aiDailyCapUsd);
  const month = level(spend.month, settings.aiMonthlyCapUsd);
  if (settings.aiHardStop && (day === "stop" || month === "stop")) return { allowed: false, reason: "stopped" };
  return { allowed: true, degrade: pastCap(day) || pastCap(month) };
}

export type Alert = { period: "day" | "month" | "lifetime"; level: "warn" | "stop"; spent: number; cap: number };

/** The alert each period has reached, if any: the highest only, so a jump straight to the stop is one email. */
export function alertsFor(settings: Settings, totals: { day: number; month: number; lifetime: number }): Alert[] {
  const out: Alert[] = [];
  const life = lifetimeLevel(totals.lifetime, settings.aiLifetimeCapUsd);
  if (life !== "ok")
    out.push({ period: "lifetime", level: life === "stop" ? "stop" : "warn", spent: totals.lifetime, cap: settings.aiLifetimeCapUsd });
  for (const [period, spent, cap] of [
    ["day", totals.day, settings.aiDailyCapUsd],
    ["month", totals.month, settings.aiMonthlyCapUsd],
  ] as const) {
    const l = level(spent, cap);
    if (l === "stop") out.push({ period, level: "stop", spent, cap });
    else if (l === "warn" || l === "over") out.push({ period, level: "warn", spent, cap });
  }
  return out;
}

const usd = (n: number) => "$" + n.toFixed(2);

/** The email an admin gets when a cap is reached. Says plainly whether anything has stopped. */
export function alertText(alert: Alert, hardStop: boolean): { subject: string; body: string } {
  const period = alert.period === "day" ? "daily" : alert.period === "month" ? "monthly" : "lifetime";
  const pct = Math.round((alert.spent / alert.cap) * 100);
  if (alert.period === "lifetime") {
    return alert.level === "warn"
      ? {
          subject: `90x AI spend: ${pct}% of the lifetime cap`,
          body: `Total AI spend has reached ${usd(alert.spent)}, ${pct}% of the lifetime cap of ${usd(alert.cap)}. AI stops completely when it is reached. You can raise the cap in Admin → Settings.`,
        }
      : {
          subject: "90x AI spend: lifetime cap reached, AI stopped",
          body: `Total AI spend has reached ${usd(alert.spent)}, the lifetime cap of ${usd(alert.cap)}. Grading, Coach, mocks, reviews and lessons have stopped, whatever the hard-stop switch says; cards, Today and the Library still work. Raise the cap in Admin → Settings to resume.`,
        };
  }
  if (alert.level === "warn") {
    return {
      subject: `90x AI spend: ${pct}% of the ${period} cap`,
      body: `AI spend has reached ${usd(alert.spent)}, ${pct}% of the ${period} cap of ${usd(alert.cap)}. Nothing has stopped. You can change the caps or pause AI in Admin → Settings.`,
    };
  }
  return {
    subject: `90x AI spend: ${period} cap doubled`,
    body: hardStop
      ? `AI spend has reached ${usd(alert.spent)}, twice the ${period} cap of ${usd(alert.cap)}. Grading, Coach, mocks, reviews and lessons have stopped; cards, Today and the Library still work. Raise the cap or switch the hard stop off in Admin → Settings to resume.`
      : `AI spend has reached ${usd(alert.spent)}, twice the ${period} cap of ${usd(alert.cap)}. The hard stop is off, so AI is still running. Pause AI or raise the cap in Admin → Settings if this is unexpected.`,
  };
}
