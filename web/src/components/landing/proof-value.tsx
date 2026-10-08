import type { ProofItem } from "@/lib/landing/proof";

/**
 * One proof number's value: plain text, or the code link with its arrow. The desktop strip and the phone tiles both
 * render it, so the link looks and reads the same in both. The link's `after` box covers its whole tile (the nearest
 * `relative` box), so a tap anywhere on "Code / on GitHub, MIT" opens it.
 */
export function ProofValue({ item }: { item: ProofItem }) {
  if (!item.href) return <>{item.value}</>;
  return (
    <a
      href={item.href}
      aria-label="Code on GitHub"
      className="rounded-sm text-cyan transition-colors after:absolute after:inset-0 hover:text-cyan-hi"
    >
      {item.value}
      <span aria-hidden="true" className="ml-0.5 align-super text-tag">
        ↗
      </span>
    </a>
  );
}
