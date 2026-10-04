import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { level, lifetimeLevel } from "@/lib/ai/guard-rules";
import { readSpend } from "@/lib/ai/usage";
import { requireAdmin } from "@/lib/auth/viewer";
import { getSettings } from "@/lib/settings";
import { AdminNav, backToApp } from "../admin-nav";
import { ProgressBar } from "../cards/status-chip";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

const TONE = { ok: "", warn: "text-warn", over: "text-bad", stop: "text-bad" } as const;
const NOTE = {
  ok: "within the cap",
  warn: "over 80% of the cap",
  over: "over the cap, the Coach is on the lighter model",
  stop: "twice the cap",
} as const;

function Meter({ label, spent, cap, lifetime = false }: { label: string; spent: number; cap: number; lifetime?: boolean }) {
  const l = lifetime ? lifetimeLevel(spent, cap) : level(spent, cap);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-small text-mute">{label}</span>
        <span className={`tabular text-small ${TONE[l]}`}>{NOTE[l]}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`tabular font-display text-title font-bold ${TONE[l]}`}>${spent.toFixed(2)}</span>
        <span className="text-small text-text-2">of ${cap.toFixed(2)}</span>
      </div>
      <ProgressBar done={Math.min(spent, cap)} total={cap} label={`${label}: $${spent.toFixed(2)} of $${cap.toFixed(2)}`} />
    </div>
  );
}

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [settings, spend] = await Promise.all([getSettings(), readSpend()]);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageHeader title="Settings" action={backToApp} />
      <AdminNav current="Settings" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Meter label="AI spend today (UTC)" spent={spend.day} cap={settings.aiDailyCapUsd} />
        <Meter label="AI spend this month" spent={spend.month} cap={settings.aiMonthlyCapUsd} />
        <Meter label="AI spend, all time" spent={spend.lifetime} cap={settings.aiLifetimeCapUsd} lifetime />
      </div>
      <SettingsForm settings={settings} />
    </main>
  );
}
