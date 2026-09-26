import { z } from "zod";

export const RESULTS = [
  { value: "solved", label: "Solved" },
  { value: "hints", label: "With hints" },
  { value: "failed", label: "Failed" },
] as const;
export const TIME_CHIPS = [15, 30, 45, 60] as const;

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

export type CheckinInput = z.infer<typeof Checkin>;
export const parseCheckin = (form: FormData) => Checkin.safeParse(Object.fromEntries(form.entries()));
