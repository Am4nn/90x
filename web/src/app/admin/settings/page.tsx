import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { budget } from "@/lib/ai/usage";
import { requireAdmin } from "@/lib/auth/viewer";
import { getSettings } from "@/lib/settings";
import { AdminNav, backToApp } from "../admin-nav";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [settings, ai] = await Promise.all([getSettings(), budget()]);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageHeader title="Settings" action={backToApp} />
      <AdminNav current="Settings" />
      <p className="text-small text-mute">
        AI spend this month: <span className="tabular font-semibold text-text">${ai.spent.toFixed(2)}</span> of $
        {settings.aiMonthlyCapUsd.toFixed(2)}.
      </p>
      <SettingsForm settings={settings} />
    </main>
  );
}
