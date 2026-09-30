import type { SVGProps } from "react";

// Ren, the coach mark: a shaded sphere with two eyes, shared with our sibling app
// Curfew so the same character stands for the coach in both. It goes wherever the
// Coach speaks, in place of a generic initial. The nav keeps CoachIcon, so the
// icon set there stays one family (DESIGN.md -> Signature Components).
//
// The red is the one colour outside the topic and status roles, because it marks
// an identity rather than a state. It is a family of tokens (--x-ren*), not
// hexes, so there is still exactly one place to change the character.
//
// The gradient is deliberate and narrow: DESIGN.md bans gradients as decoration,
// and this is the character's own shading, not emphasis borrowed from it.
//
// `id` is fixed rather than generated because two Rens on a page may share one
// gradient definition - and a generated id would differ between the server and
// client renders, which React treats as a hydration mismatch.
export function Ren({ title, size = 28, ...props }: SVGProps<SVGSVGElement> & { title?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="shrink-0"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id="ren-lit" cx="33%" cy="25%" r="78%">
          <stop offset="0%" stopColor="var(--x-ren-hi)" />
          <stop offset="20%" stopColor="var(--x-ren-mid)" />
          <stop offset="52%" stopColor="var(--x-ren)" />
          <stop offset="100%" stopColor="var(--x-ren-shade)" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="9.3" fill="url(#ren-lit)" />
      <ellipse cx="8.5" cy="8" rx="3.4" ry="2.3" transform="rotate(-32 8.5 8)" fill="var(--x-ren-hi)" fillOpacity="0.4" />
      <ellipse cx="9.1" cy="12.4" rx="1.45" ry="2" fill="var(--x-ren-eye)" opacity="0.9" />
      <ellipse cx="15.2" cy="12.4" rx="1.45" ry="2" fill="var(--x-ren-eye)" opacity="0.9" />
    </svg>
  );
}
