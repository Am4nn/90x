import type { SVGProps } from "react";

// Ren, the coach mark: a shaded sphere with two eyes, shared with our sibling app
// Curfew so the same character stands for the coach in both. It goes wherever the
// Coach speaks, in place of a generic initial. The nav keeps CoachIcon, so the
// icon set there stays one family (DESIGN.md -> Signature Components).
//
// The red is the one colour outside the topic and status roles, because it marks
// an identity rather than a state. It is a token (--color-ren), not a hex, so
// there is still exactly one place to change it.
//
// The gradient is deliberate and narrow: DESIGN.md bans gradients as decoration,
// and this is the character's own shading, not emphasis borrowed from it.
//
// `id` is fixed rather than generated because two Rens on a page may share one
// gradient definition - and a generated id would differ between the server and
// client renders, which React treats as a hydration mismatch.
export function Ren({ title, ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-7 shrink-0" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id="ren-lit" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="var(--color-ren)" />
          <stop offset="100%" stopColor="var(--color-ren-shade)" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#ren-lit)" />
      <circle cx="9" cy="11" r="1.6" fill="var(--color-text)" />
      <circle cx="15" cy="11" r="1.6" fill="var(--color-text)" />
    </svg>
  );
}
