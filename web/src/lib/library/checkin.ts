import { z } from "zod";

export const RESULTS = [
  { value: "solved", label: "Solved" },
  { value: "hints", label: "Hints" },
  { value: "failed", label: "Missed" },
] as const;
export const TIME_CHIPS = [15, 30, 45, 60] as const;

/** The time chip closest to a sync's suggested minutes. Null in, null out:
 *  sync must never put a time on screen it did not measure. */
export function nearestTimeChip(minutes: number | null): (typeof TIME_CHIPS)[number] | null {
  if (minutes === null) return null;
  return TIME_CHIPS.reduce((best, chip) => (Math.abs(chip - minutes) < Math.abs(best - minutes) ? chip : best));
}

const Checkin = z.object({
  problemSlug: z.string().min(1).max(200),
  result: z.enum(["solved", "hints", "failed"]),
  minutes: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(1).max(600).nullable()),
  note: z
    .string()
    .optional()
    .transform((v) => v?.trim() || null)
    .pipe(z.string().max(2000).nullable()),
});

export const parseCheckin = (form: FormData) => Checkin.safeParse(Object.fromEntries(form.entries()));

// The details a reader adds to a check-in sync already wrote: the time, whether
// hints were used, a note. The result itself is LeetCode's; hints is the only change.
const SyncedDetails = z.object({
  checkinId: z.uuid(),
  minutes: Checkin.shape.minutes,
  hints: z
    .string()
    .optional()
    .transform((v) => v === "1"),
  note: Checkin.shape.note,
});

export const parseSyncedDetails = (form: FormData) => SyncedDetails.safeParse(Object.fromEntries(form.entries()));
