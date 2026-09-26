import { z } from "zod";

export const ROLES = [
  { value: "backend", label: "Backend engineer" },
  { value: "fullstack", label: "Full-stack engineer" },
  { value: "frontend", label: "Frontend engineer" },
  { value: "mobile", label: "Mobile engineer" },
  { value: "data", label: "Data engineer" },
  { value: "ml", label: "ML engineer" },
] as const;

export const LANGUAGES = [
  { value: "java", label: "Java" },
  { value: "python", label: "Python" },
  { value: "cpp", label: "C++" },
  { value: "javascript", label: "JavaScript" },
] as const;

/** Daily time budget chips (minutes). */
export const BUDGETS = [
  { value: "60", label: "1h" },
  { value: "120", label: "2h" },
  { value: "180", label: "3h" },
  { value: "240", label: "4h" },
] as const;
const budget = z.coerce.number().refine((m) => BUDGETS.some((b) => Number(b.value) === m), "Pick a time");

function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const SetupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  role: z.enum(ROLES.map((r) => r.value) as [string, ...string[]]),
  language: z.enum(LANGUAGES.map((l) => l.value) as [string, ...string[]]),
  timezone: z.string().refine(isTimeZone, "Pick a valid time zone"),
  campaign_days: z.coerce.number().int().min(7, "At least 7 days").max(365, "At most 365 days"),
  leetcode_username: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || null),
  has_leetcode_premium: z.string().optional().transform((v) => v === "on"),
  weekday_minutes: budget,
  weekend_minutes: budget,
});

export type Setup = z.infer<typeof SetupSchema>;

export function parseSetup(form: FormData) {
  return SetupSchema.safeParse(Object.fromEntries(form.entries()));
}
