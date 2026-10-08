import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { button } from "@/components/button-styles";
import { SubmitButton } from "@/components/form";
import { InstallPrompt } from "@/components/install/install-prompt";
import { PushSettings } from "@/components/push/push-settings";
import { SignOutForm } from "@/components/sign-out-form";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireViewer } from "@/lib/auth/viewer";
import { pushEnabled, settingsOf } from "@/lib/push";
import { DeleteAccount } from "./delete-account";

export const metadata: Metadata = { title: "Settings" };

const HELP = [
  { href: "/me/report?from=/me/settings", label: "Report a problem" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
] as const;

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const [prefs] = await db
    .select({ notifications: profiles.notifications, morningHour: profiles.morningPushHour })
    .from(profiles)
    .where(eq(profiles.userId, viewer.id));

  const account = [
    { label: "Name", value: viewer.name || "—" },
    { label: "Email", value: viewer.email ?? "—" },
    { label: "Timezone", value: viewer.timezone },
  ] as const;

  return (
    <>
      {/* The mock's header: a bordered back icon button, the title, and a ghost
          "Done" that is desktop-only. Both the icon and Done link back to Me. */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href="/me" aria-label="Back to Me" className={button({ variant: "secondary", size: "icon-sm" })}>
            <svg
              viewBox="0 0 24 24"
              className="size-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
          <h1 className="font-display text-title font-semibold tracking-tight">Settings</h1>
        </div>
        <span className="hidden md:inline-flex">
          <Link href="/me" className={button({ variant: "ghost", size: "sm" })}>
            Done
          </Link>
        </span>
      </header>

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

      <InstallPrompt variant="row" />

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

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-heading font-semibold">Help and legal</h2>
        <ul className="flex flex-col rounded-xl border border-line bg-surface">
          {HELP.map(({ href, label }) => (
            <li key={href} className="border-t border-line first:border-0">
              <Link href={href} className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-surface-2">
                <span className="text-small font-semibold text-text">{label}</span>
                <span aria-hidden className="text-mute">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <SignOutForm>
        <SubmitButton pendingLabel="Signing out…" className={`${button({ variant: "ghost" })} w-full border border-line-2`}>
          Sign out
        </SubmitButton>
        {/* Sign-out cancels this device's push subscription (SignOutForm), so the next person on a shared
            device gets none of these pushes. Nothing turns it back on by itself after the next sign-in. */}
        <p className="mt-2 text-center text-small text-mute">Signing out also turns off notifications on this device.</p>
      </SignOutForm>

      <DeleteAccount />
    </>
  );
}
