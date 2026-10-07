import { z } from "zod";
import { MAINTENANCE_MESSAGE_MAX, tidyMessage } from "@/lib/maintenance/rules";

// The switches and caps an admin can change without a deploy. Pure rules, kept apart
// from the database and Redis wrapper (settings.ts) so they can be tested on their own.

export type Settings = {
  /** Approve a new sign-in straight away instead of leaving it on the pending screen. */
  autoApprove: boolean;
  /** AI spend caps in US dollars. The hard stop lands at twice a cap. */
  aiDailyCapUsd: number;
  aiMonthlyCapUsd: number;
  /** The most one person's AI use can cost in a day, in US dollars. Past it their AI features rest until tomorrow. */
  aiUserDailyCapUsd: number;
  /** Total AI spend ever, in US dollars. AI stops completely when it is reached, whatever the hard-stop switch says. */
  aiLifetimeCapUsd: number;
  /** Stop AI features at twice a cap. Off means they keep running however far past it spend goes. */
  aiHardStop: boolean;
  /** Stop AI features now, whatever the spend. */
  aiPaused: boolean;
  /** The day the launch post went out, "YYYY-MM-DD", or null before it is set. Starts the 30-day launch gate. */
  launchDate: string | null;
  /** The app is down for everyone but admins (lib/maintenance). Mirrored to Redis on save, which is what the proxy reads. */
  maintenance: boolean;
  /** One optional line under the maintenance page's text. Empty shows nothing. */
  maintenanceMessage: string;
};

export const DEFAULT_SETTINGS: Settings = {
  autoApprove: false,
  aiDailyCapUsd: 3,
  aiMonthlyCapUsd: 30,
  aiUserDailyCapUsd: 0.25,
  aiLifetimeCapUsd: 105,
  aiHardStop: true,
  aiPaused: false,
  launchDate: null,
  maintenance: false,
  maintenanceMessage: "",
};

const cap = z.number().positive().max(1000);
/** The maintenance switch and its message: saved on their own (setMaintenance), never by the general form. */
const MAINTENANCE_FIELD = {
  maintenance: z.boolean(),
  maintenanceMessage: z
    .string()
    .transform(tidyMessage)
    .pipe(z.string().max(MAINTENANCE_MESSAGE_MAX, `Keep the maintenance message to ${MAINTENANCE_MESSAGE_MAX} characters.`)),
};
const GENERAL_FIELD = {
  autoApprove: z.boolean(),
  aiDailyCapUsd: cap,
  aiMonthlyCapUsd: cap,
  aiUserDailyCapUsd: z.number().positive().max(100),
  aiLifetimeCapUsd: z.number().positive().max(100_000),
  aiHardStop: z.boolean(),
  aiPaused: z.boolean(),
  launchDate: z.union([z.literal("").transform(() => null), z.iso.date()]).nullable(),
};
const FIELD = { ...GENERAL_FIELD, ...MAINTENANCE_FIELD } satisfies { [K in keyof Settings]: z.ZodType<Settings[K]> };

/** Everything the general settings form saves: all but the maintenance switch and message. */
export type GeneralSettings = Omit<Settings, keyof typeof MAINTENANCE_FIELD>;

/** The `app_settings.key` each setting is stored under. */
export const SETTING_KEYS = {
  autoApprove: "auto_approve",
  aiDailyCapUsd: "ai_daily_cap_usd",
  aiMonthlyCapUsd: "ai_monthly_cap_usd",
  aiUserDailyCapUsd: "ai_user_daily_cap_usd",
  aiLifetimeCapUsd: "ai_lifetime_cap_usd",
  aiHardStop: "ai_hard_stop",
  aiPaused: "ai_paused",
  launchDate: "launch_date",
  maintenance: "maintenance",
  maintenanceMessage: "maintenance_message",
} as const satisfies Record<keyof Settings, string>;

/** What the settings form submits. A monthly cap below the daily cap is a typo, not a policy. */
export const SettingsInput = z
  .object(GENERAL_FIELD)
  .refine((s) => s.aiMonthlyCapUsd >= s.aiDailyCapUsd, {
    message: "The monthly cap can't be lower than the daily cap.",
    path: ["aiMonthlyCapUsd"],
  })
  .refine((s) => s.aiLifetimeCapUsd >= s.aiMonthlyCapUsd, {
    message: "The lifetime cap can't be lower than the monthly cap.",
    path: ["aiLifetimeCapUsd"],
  });

/** Stored rows over the defaults. A missing or malformed value keeps its default, so a bad row can never switch AI off or approval on. */
export function mergeSettings(rows: readonly { key: string; value: unknown }[]): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS };
  for (const name of Object.keys(SETTING_KEYS) as (keyof Settings)[]) {
    const row = rows.find((r) => r.key === SETTING_KEYS[name]);
    if (!row) continue;
    const parsed = FIELD[name].safeParse(row.value);
    if (parsed.success) (merged[name] as Settings[typeof name]) = parsed.data;
  }
  return merged;
}

/** Whether the sign-in callback should approve this user now. Only a request still waiting is approved: never a rejected or revoked account. */
export function shouldAutoApprove(autoApprove: boolean, status: string | null | undefined): boolean {
  return autoApprove && status === "pending";
}

/** What the maintenance form submits. */
export const MaintenanceInput = z.object(MAINTENANCE_FIELD);

/** The rows a save writes, for the settings given and no others. `app_settings.value` is jsonb not null, so "no launch date" is stored as "". */
export function settingRows(settings: Partial<Settings>): { key: string; value: unknown }[] {
  return (Object.keys(SETTING_KEYS) as (keyof Settings)[])
    .filter((name) => name in settings)
    .map((name) => ({ key: SETTING_KEYS[name], value: settings[name] ?? "" }));
}
