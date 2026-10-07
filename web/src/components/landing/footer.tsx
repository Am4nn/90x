import Link from "next/link";
import { REPO_URL } from "@/lib/landing/proof";

const LINK = "rounded-sm text-text-2 transition-colors hover:text-cyan-hi";

/** The links both footers carry, in order. The source link leaves the site, so it is a plain anchor. */
export const FOOTER_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/delete-account", label: "Delete account" },
  { href: REPO_URL, label: "Source on GitHub" },
] as const;

/** One footer link; `className` adds to the shared look. */
export function FooterLink({ href, children, className = "" }: { href: string; children: string; className?: string }) {
  const classes = `${LINK} ${className}`;
  return href.startsWith("/") ? (
    <Link href={href} className={classes}>
      {children}
    </Link>
  ) : (
    <a href={href} className={classes}>
      {children}
    </a>
  );
}

/**
 * The bottom line on a wide layout: the wordmark, the legal pages, where to report a problem and where the code
 * lives. On a phone the close page carries its own copy of the links (CloseSection), so this one is not laid out:
 * a footer below the last snap page could not be reached.
 */
export function Footer() {
  const [privacy, terms, remove, source] = FOOTER_LINKS;
  return (
    <footer className="relative z-1 border-t border-line @max-wide:hidden">
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-6 gap-y-3 px-gutter py-6 text-small leading-none font-medium text-mute">
        <span className="font-display text-heading leading-none font-bold text-text">
          90<span className="text-cyan">x</span>
        </span>
        <span className="flex-1" />
        <FooterLink href={privacy.href}>{privacy.label}</FooterLink>
        <FooterLink href={terms.href}>{terms.label}</FooterLink>
        <FooterLink href={remove.href}>{remove.label}</FooterLink>
        <FooterLink href={source.href}>{source.label}</FooterLink>
      </div>
    </footer>
  );
}
