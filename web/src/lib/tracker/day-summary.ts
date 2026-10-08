import type { DayStatus } from "./days";
import { hours, type MissionType } from "./template";

// Today's headline: what the day holds and how long it takes, read from the
// same missions the list below it shows. Pure, so the copy is tested here.

type Mission = {
  slotType: MissionType;
  status: "open" | "done" | "skipped" | "coming_soon";
  estMinutes: number;
  isRevive: boolean;
  isExtra: boolean;
};

const ORDER: MissionType[] = ["new_problem", "review", "topic", "cards"];
const CARDS_PER_MISSION = 10;

function phrase(type: MissionType, n: number): string {
  if (type === "cards") return `${n * CARDS_PER_MISSION} cards`;
  const [one, many] = { new_problem: ["problem", "problems"], review: ["review", "reviews"], topic: ["topic", "topics"] }[type];
  return n === 1 ? `a ${one}` : `${n} ${many}`;
}

/** "a, b and c" */
function list(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "2 problems, a topic and 10 cards · about 2h 5m". The day number is on the line above, so it is not repeated.
 *  Once something is finished it counts what is left; a finished day, a rest day and a day with nothing countable
 *  yet each get one short line.
 *  Revive and extra missions belong to another day or to no day, so they never count.
 *  The time is the missions actually on screen, so it can run past the daily length the user chose: on a day with
 *  no reviews due the planner turns a spare review slot (25 min) into a new problem (40 min). That is deliberate;
 *  the line describes the day as planned, not the budget. */
export function daySummary(status: DayStatus, missions: Mission[]): string {
  const counted = missions.filter((m) => m.status !== "coming_soon" && !m.isRevive && !m.isExtra);
  if (status === "rest") return "A rest day";
  // Not a rest day, yet nothing counts: only a cards mission still waiting for its first cards.
  if (!counted.length) return "Nothing to do yet today";
  const open = counted.filter((m) => m.status === "open");
  if (status === "done" || !open.length) return "All done. The square is yours.";
  const parts = ORDER.map((type) => [type, open.filter((m) => m.slotType === type).length] as const)
    .filter(([, n]) => n > 0)
    .map(([type, n]) => phrase(type, n));
  const left = open.length < counted.length ? " left" : "";
  const minutes = open.reduce((sum, m) => sum + m.estMinutes, 0);
  return cap(`${list(parts)}${left} · about ${hours(minutes)}`);
}
