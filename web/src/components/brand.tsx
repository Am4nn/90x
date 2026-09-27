import { BRAND_COLORS, MARK_BOX, MARK_FONT_SIZE, MARK_STROKE } from "@/lib/brand/mark";
import { MARK } from "@/lib/brand/mark-geometry";

// The in-app wordmark: the same generated drawing as the icons and favicon
// (Sora "90" as outlines plus the two-stroke cyan x), cropped to its ink.
// Sized by the text class it's given: its height follows the font size.
const PAD = MARK_STROKE / 2;
const LEFT = (MARK_BOX - MARK.width) / 2 - PAD;
const WIDTH = MARK.width + PAD * 2;
const TOP = 34;
const HEIGHT = 32;

export function Logo({ className = "text-title" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`} role="img" aria-label="90x">
      <svg viewBox={`${LEFT} ${TOP} ${WIDTH} ${HEIGHT}`} style={{ height: `${HEIGHT / MARK_FONT_SIZE}em` }} aria-hidden="true">
        <path d={MARK.ninety} fill={BRAND_COLORS.text} />
        {MARK.strokes.map((l) => (
          <line key={`${l.x1}-${l.y1}`} {...l} stroke={BRAND_COLORS.accent} strokeWidth={MARK_STROKE} strokeLinecap="round" />
        ))}
      </svg>
    </span>
  );
}
