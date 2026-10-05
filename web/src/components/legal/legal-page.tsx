import Link from "next/link";
import { Logo } from "@/components/brand";
import { PageHeader } from "@/components/page-header";

/** The date shown on all three pages. Change it when any of them changes in substance. */
const UPDATED = "5 October 2026";

/** Shell for the public legal pages: reachable signed out, so it has no app chrome. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="pt-safe-lg mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pb-8 md:pb-12">
      <Link href="/" aria-label="90x home" className="self-start">
        <Logo className="text-title" />
      </Link>
      <PageHeader title={title} />
      <p className="-mt-3 text-small text-mute">Last updated {UPDATED}</p>
      <div className="flex flex-col gap-6 text-body text-text-2">{children}</div>
      <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-small font-semibold">
        <Link href="/privacy" className="text-text-2 hover:text-text">
          Privacy Policy
        </Link>
        <Link href="/terms" className="text-text-2 hover:text-text">
          Terms of Service
        </Link>
        <Link href="/delete-account" className="text-text-2 hover:text-text">
          Delete my account
        </Link>
      </nav>
    </main>
  );
}

/** A titled block of prose. */
export function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-display text-heading font-semibold text-text">{title}</h2>
      {children}
    </section>
  );
}

export function Bullets({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-mute">{children}</ul>;
}

/** An inline link that reads as one. */
export function A({ href, children }: { href: string; children: React.ReactNode }) {
  const className = "text-cyan underline underline-offset-2 hover:text-cyan-hi";
  return href.startsWith("/") ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
