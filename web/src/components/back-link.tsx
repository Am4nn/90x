import Link from "next/link";

/** "← Parent" above a drill-down page's title: one size, one colour, a tap-sized target. */
export function BackLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`-my-1.5 inline-flex h-9 items-center gap-1.5 self-start text-small font-semibold text-text-2 hover:text-text ${className}`}
    >
      <span aria-hidden>←</span>
      {children}
    </Link>
  );
}
