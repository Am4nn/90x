import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { SIDEBAR } from "@/components/shell/nav-items";
import { requireViewer } from "@/lib/auth/viewer";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  const viewer = await requireViewer({ allowSetup: true });
  if (viewer.setupDone) redirect("/today");
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1.5 border-r border-line px-3.5 py-6 md:flex">
        <Link href="/today" prefetch={false} className="px-2.5 pb-5">
          <Logo />
        </Link>
        <span aria-current="page" className="flex items-center gap-3 rounded-lg bg-cyan-bg p-2.5 text-body font-semibold text-cyan">
          <span aria-hidden className="size-5" />
          Set up
        </span>
        {SIDEBAR.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className="group flex items-center gap-3 rounded-lg p-2.5 text-body font-semibold text-text-2 transition-colors hover:bg-surface hover:text-text"
          >
            <Icon className="size-5 text-mute group-hover:text-text-2" />
            {label}
          </Link>
        ))}
      </aside>
      <main className="pt-safe-lg mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-12 md:mx-0 md:max-w-2xl md:px-10 md:pt-8 md:pb-12">
        {/* The name Google gave, or an empty field: an email is never offered as a name. */}
        <SetupForm defaults={{ name: viewer.name, timezone: "" }} />
      </main>
    </div>
  );
}
