import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/trust/report-rules";

const LINK = "rounded-sm text-text-2 transition-colors hover:text-cyan-hi";

/** The bottom line: the wordmark, the legal pages, where to report a problem and where the code lives. */
export function Footer() {
  return (
    <footer className="relative z-1 border-t border-line">
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-6 gap-y-3 px-gutter py-6 text-small leading-none font-medium text-mute">
        <span className="font-display text-heading leading-none font-bold text-text">
          90<span className="text-cyan">x</span>
        </span>
        <span className="flex-1" />
        <Link href="/privacy" className={LINK}>
          Privacy
        </Link>
        <Link href="/terms" className={LINK}>
          Terms
        </Link>
        <Link href="/delete-account" className={LINK}>
          Delete account
        </Link>
        {/* Signed out, so no form: the address is plain, selectable text. */}
        <span>
          Report a problem: <span className="text-text-2 select-all">{SUPPORT_EMAIL}</span>
        </span>
        <a href="https://github.com/Am4nn/90x" className={LINK}>
          Source on GitHub
        </a>
      </div>
    </footer>
  );
}
