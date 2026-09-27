import { SPLASH_MARK_SIZE } from "@/lib/brand/launch-images";
import { type Line, MARK_BOX, MARK_STROKE } from "@/lib/brand/mark";
import { MARK } from "@/lib/brand/mark-geometry";
import { SplashDone } from "./splash-done";

// Dash long enough to hide the stroke and its round caps before it draws.
function dash(l: Line) {
  const length = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
  return { strokeDasharray: `${length} ${length + 2 * MARK_STROKE}`, strokeDashoffset: length + MARK_STROKE };
}

/**
 * Cold-start splash (styles in globals.css): server-rendered so it paints
 * before any script, the mark at the size and place of the iOS launch image.
 * SplashDone fades it out after hydration; CSS fades it out at 2.5s regardless.
 */
export function Splash() {
  return (
    <div className="splash" aria-hidden="true">
      <div className="splash-mark">
        <svg width={SPLASH_MARK_SIZE} height={SPLASH_MARK_SIZE} viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`}>
          <path className="splash-90" d={MARK.ninety} />
          {MARK.strokes.map((l, i) => (
            <line
              key={i}
              className={`splash-x splash-x${i + 1}`}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              strokeWidth={MARK_STROKE}
              strokeLinecap="round"
              {...dash(l)}
            />
          ))}
        </svg>
        <div className="splash-bar">
          <i />
        </div>
      </div>
      <SplashDone />
    </div>
  );
}
