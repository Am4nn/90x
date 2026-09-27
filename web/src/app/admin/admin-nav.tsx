import Link from "next/link";

const LINKS = [
  { href: "/admin", label: "Home" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/cards", label: "Cards" },
] as const;

/** "Home · Users · Cards" in the admin page headers, plus a way back to the app. */
export function AdminNav({ current }: { current: "Home" | "Users" | "Cards" }) {
  return (
    <nav aria-label="Admin" className="flex flex-wrap items-center gap-1.5 text-small font-semibold">
      <Link href="/today" className="mr-2 text-mute hover:text-text">
        ← App
      </Link>
      {LINKS.map((l, i) => (
        <span key={l.href} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-mute">·</span>}
          {l.label === current ? (
            <span aria-current="page" className="text-cyan">
              {l.label}
            </span>
          ) : (
            <Link href={l.href} className="text-text-2 hover:text-text">
              {l.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
