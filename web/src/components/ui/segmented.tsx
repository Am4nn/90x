import Link from "next/link";

type Option = { value: string; label: string; href: string };

/** A segmented control driven by the URL, so the page stays a server
 *  component. Same look as the library's area tabs: a bordered container with
 *  rounded items, not pills. */
export function Segmented({ options, value, name }: { options: Option[]; value: string; name: string }) {
  return (
    <nav aria-label={name} className="inline-flex gap-1 self-start rounded-xl border border-line bg-surface p-1">
      {options.map((o) => (
        <Link
          key={o.value}
          href={o.href}
          scroll={false}
          aria-current={o.value === value ? "page" : undefined}
          className={`rounded-lg px-4 py-2 text-small font-semibold ${o.value === value ? "bg-surface-2 text-text" : "text-mute hover:text-text-2"}`}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
