import type { GateCounts } from "@/lib/admin/analytics";
import { GATE_DAYS, GATE_TARGET, RETURN_AFTER_DAYS, launchGate } from "@/lib/admin/analytics-math";
import { Meter, Section, Stat } from "./charts";

type State = ReturnType<typeof launchGate>["state"];

// Chip, bar tint and caption per state. Green is on track or met, amber is behind pace, red is closed below target.
const LOOK: Record<State, { chip: string; label: string; tone: "ok" | "warn" | "bad" }> = {
  "on-track": { chip: "border-ok/35 bg-ok/10 text-ok", label: "on track", tone: "ok" },
  behind: { chip: "border-warn/35 bg-warn/10 text-warn", label: "behind pace", tone: "warn" },
  "closed-below": { chip: "border-bad/35 bg-bad/10 text-bad", label: "window closed below target", tone: "bad" },
  "closed-met": { chip: "border-ok/35 bg-ok/10 text-ok", label: "target met", tone: "ok" },
};

/** The launch target: 20 week-2 returners within 30 days of the launch post. Admin analytics only,
 *  and only rendered when a launch date is set. */
export function LaunchGatePanel({ counts, today }: { counts: GateCounts; today: string }) {
  const gate = launchGate({ launchDate: counts.launchDate, today, returners: counts.returners });
  const look = LOOK[gate.state];
  const closed = gate.state === "closed-below" || gate.state === "closed-met";
  const target = GATE_TARGET;
  const text = `${gate.returners} of ${target}`;
  return (
    <Section title="Launch gate" hint={`${target} week-2 returners within ${GATE_DAYS} days`}>
      <div className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-small text-mute">
          <span>
            {counts.launchDate > today ? "Launches" : "Launched"} <span className="tabular text-text-2">{counts.launchDate}</span>
          </span>
          <span className="tabular text-text-2">
            Day {gate.dayOf30} of {GATE_DAYS}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-tag font-semibold ${look.chip}`}>
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            {look.label}
          </span>
        </div>
        <Stat title="Week-2 returners" value={text} boxed={false} />
        <div className="flex flex-col gap-1.5">
          <Meter label="Week-2 returners" value={gate.returners} max={target} text={text} tone={look.tone} showText={false} />
          <span className="tabular flex justify-end text-tag text-mute">
            {closed ? "window closed" : `pace for day ${gate.dayOf30}: ${gate.pace} of ${target}`}
          </span>
        </div>
        <p className="tabular text-small text-text-2">
          Signups <b className="font-semibold text-text">{counts.signups}</b> &middot; Activated{" "}
          <b className="font-semibold text-text">{counts.activated}</b> &middot; Returners{" "}
          <b className="font-semibold text-text">{gate.returners}</b>
        </p>
        {gate.dayOf30 < RETURN_AFTER_DAYS && !closed && <p className="text-small text-mute">Returners can&apos;t appear before day 7.</p>}
        <p className="border-t border-line pt-3 text-small text-mute">
          A week-2 returner did a real action on any day 7 or more days after signup.
        </p>
      </div>
    </Section>
  );
}
