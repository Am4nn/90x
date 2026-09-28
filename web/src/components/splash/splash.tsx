import { SPLASH_MARK_SIZE } from "@/lib/brand/launch-images";
import { type Line, MARK_BOX, MARK_STROKE } from "@/lib/brand/mark";
import { MARK } from "@/lib/brand/mark-geometry";
import { SplashDone } from "./splash-done";

/**
 * Cold-start splash (styles in globals.css): server-rendered so it paints before
 * any script, holding the mark at exactly the size and place of the iOS launch
 * image. It does not animate.
 *
 * It used to draw the x and then run a progress line under it, which meant the
 * launch image handed off to a second, different thing before the app appeared -
 * three stages where there should be one. Holding the same image the launch
 * screen already showed makes the hand-off invisible, and the only movement is
 * the fade to the app. SplashDone fades it out on hydration; CSS fades it out at
 * 2.5s regardless, so a stalled load cannot leave it stuck.
 */
export function Splash() {
  return (
    <div className="splash" aria-hidden="true">
      <svg width={SPLASH_MARK_SIZE} height={SPLASH_MARK_SIZE} viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`}>
        <path className="splash-90" d={MARK.ninety} />
        {MARK.strokes.map((l: Line, i: number) => (
          <line key={i} className="splash-x" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} strokeWidth={MARK_STROKE} strokeLinecap="round" />
        ))}
      </svg>
      <SplashDone />
    </div>
  );
}
