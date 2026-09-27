import Link from "next/link";
import { button } from "@/components/button-styles";

const LINKS = [
  { href: "/admin", label: "Home" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/cards", label: "Cards" },
] as const;

/** The way back to the app, for the admin page headers' action slot. */
export const backToApp = (
  <Link href="/today" className={button({ size: "sm" })}>
    Back to app
  </Link>
);

/** Home / Users / Cards tabs under the admin page headers (same look as the Library's area tabs). */
export function AdminNav({ current }: { current: "Home" | "Users" | "Cards" }) {
  return (
    <nav aria-label="Admin" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.label === current ? "page" : undefined}
          className={`rounded-lg px-3.5 py-2 text-center text-small font-semibold ${l.label === current ? "bg-surface-2 text-text" : "text-mute hover:text-text-2"}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
