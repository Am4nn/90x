import Link from "next/link";

const LINKS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/cards", label: "Cards" },
] as const;

/** "Users · Cards" in the admin page headers. */
export function AdminNav({ current }: { current: "Users" | "Cards" }) {
  return (
    <nav aria-label="Admin" className="flex items-center gap-1.5 text-small font-semibold">
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
