import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { button } from "@/components/button-styles";
import { SubmitButton } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { PushSettings } from "@/components/push/push-settings";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireViewer } from "@/lib/auth/viewer";
import { pushEnabled, settingsOf } from "@/lib/push";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const [prefs] = await db
    .select({ notifications: profiles.notifications, morningHour: profiles.morningPushHour })
    .from(profiles)
    .where(eq(profiles.userId, viewer.id));

  const account = [
    { label: "Name", value: viewer.name },
    { label: "Email", value: viewer.email ?? "—" },
    { label: "Timezone", value: viewer.timezone },
  ] as const;

  return (
    <>
      <PageHeader title="Settings" />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-heading font-semibold">Account</h2>
        <ul className="flex flex-col rounded-xl border border-line bg-surface">
          {account.map(({ label, value }) => (
            <li key={label} className="flex items-center justify-between gap-4 border-t border-line px-4 py-3.5 first:border-0">
              <span className="text-small text-text-2">{label}</span>
              <span className="text-small font-semibold text-text">{value}</span>
            </li>
          ))}
        </ul>
      </section>

      {pushEnabled() && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-heading font-semibold">Notifications</h2>
          <PushSettings
            vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!}
            initial={{ ...settingsOf(prefs?.notifications), morningHour: prefs?.morningHour ?? null }}
          />
        </section>
      )}

      <Link
        href="/me/coach"
        className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3.5 hover:bg-surface-2"
      >
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold text-text">What Coach knows</span>
          <span className="text-small text-mute">The notes Coach reads before every answer</span>
        </span>
        <span aria-hidden className="text-mute">
          →
        </span>
      </Link>

      <form action={signOut}>
        <SubmitButton pendingLabel="Signing out…" className={button()}>
          Sign out
        </SubmitButton>
      </form>
    </>
  );
}
