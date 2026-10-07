import Link from "next/link";
import { TRY_LINK_LABEL } from "@/lib/landing/copy";

/** The primary button: a plain link to /try, so it works without script and is prefetched. Cyan, as the mock's `pbtn`. */
export function TryLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/try"
      data-landing="try-link"
      className={`flex h-13 items-center justify-center rounded-lg bg-cyan px-6 text-heading font-bold whitespace-nowrap text-on-cyan transition-colors hover:bg-cyan-hi ${className}`}
    >
      {TRY_LINK_LABEL}
    </Link>
  );
}
