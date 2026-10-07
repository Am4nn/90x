// The "90x" at the close, drawn as a field of dots. The letters are sampled off Sora onto a
// grid of dots; the rest of the grid is a dim field that lights up around the cursor (or a
// slowly wandering stand-in for it). Loaded with import() after first paint, and redrawn at
// 30fps only while the close is on screen.
//
// While the particle overlay is bringing its dots in, the letters are not drawn here
// (stage.lettersHidden); once it has settled it hands the letters over to this canvas.
import { addDot, type Dots, fillDots, fitCanvas, throttledLoop } from "./canvas";
import { isNarrow } from "./pages";
import { PHONE_PARTICLE_SHARE, thin } from "./particle-math";
import { publishWordmark, stage, type WordmarkDot } from "./stage";

const FIELD = ["#151920", "#1C2029", "#2A303C", "#3E4553", "#5A6272"] as const;
const INK = "#E6E9EF";
const INK_X = "#67E8F9";
const GLITCH_COLORS = ["#FF3D68", "#67E8F9"] as const;
/** On a phone, the letter dots the overlay brought no particle to fade in over this long once it hands the letters over. */
const FILL_IN_MS = 500;
/** The dot pitch on a phone, in CSS pixels; a wide layout's is `WIDE_DOT_STEP`. */
export const PHONE_DOT_STEP = 7;
const WIDE_DOT_STEP = 11;
/** The glitch moves some rows of letter dots this many dot steps left or right, for 140ms. Specs read them from the canvas's data attributes to bound where a lit dot may be. */
export const GLITCH_REACH_STEPS = { left: 2, right: 3 } as const;
/** The cursor only counts for this long after it last moved. */
const CURSOR_MS = 2500;

export interface WordmarkOptions {
  /** Reduced motion: every letter dot, no cursor, no glitch, drawn once. */
  still: boolean;
  /** Centred on its placeholder at every width, at a smaller size: the maintenance page, not the close. */
  centered?: boolean;
}

/** The centred wordmark's largest font size, in CSS pixels. */
const CENTERED_MAX = { phone: 100, wide: 160 } as const;

/** The space the wordmark takes at the top of the close section, from its font size. */
const wordmarkSpace = (fontSize: number): number => Math.round(32 + fontSize * 0.82);

export function mountWordmark(canvas: HTMLCanvasElement, options: WordmarkOptions): { destroy(): void } {
  const section = canvas.parentElement!;
  const content = section.querySelector<HTMLElement>('[data-landing="close-content"]') ?? section;
  const family = getComputedStyle(canvas).getPropertyValue("--font-sora").trim() || "sans-serif";
  const ctx = canvas.getContext("2d")!;
  const start = performance.now();
  canvas.dataset.glitchLeft = String(GLITCH_REACH_STEPS.left);
  canvas.dataset.glitchRight = String(GLITCH_REACH_STEPS.right);

  let width = 0;
  let height = 0;
  let step = 11;
  let dots: WordmarkDot[] = [];
  let field: HTMLCanvasElement | null = null;
  let cursor: { x: number; y: number; at: number } | null = null;
  let visible = false;
  let shownSince = -1;
  let destroyed = false;

  function setup() {
    width = section.clientWidth;
    height = section.clientHeight;
    if (!width || !height) return;
    const dpr = fitCanvas(canvas, ctx, width, height);

    const narrow = isNarrow(width);
    step = narrow ? PHONE_DOT_STEP : WIDE_DOT_STEP;
    canvas.dataset.step = String(step);
    // The wordmark starts at the content's left edge and fills the content's width, so it lines up with the heading below it.
    const gutter = parseFloat(getComputedStyle(content).paddingLeft) || (narrow ? 20 : 48);
    const left = content.getBoundingClientRect().left - section.getBoundingClientRect().left + gutter;
    const inner = content.clientWidth - gutter * 2;

    const picture = document.createElement("canvas");
    picture.width = width;
    picture.height = height;
    const g = picture.getContext("2d", { willReadFrequently: true })!;
    g.font = `700 100px ${family}`;
    const ratio = (g.measureText("90").width + g.measureText("x").width) / 100;
    // A phone's wordmark is at most 28% of the page's height, so the centred group (wordmark, heading,
    // sub) always fits the page; a wide one is capped at 380px.
    const cap = options.centered ? CENTERED_MAX[narrow ? "phone" : "wide"] : narrow ? height * 0.28 : 380;
    const fontSize = Math.min(inner / ratio, cap);
    // On a phone, or anywhere when centred, the wordmark sits on its placeholder.
    const onBox = narrow || options.centered;
    g.font = `700 ${fontSize}px ${family}`;
    // Room for the wordmark. Wide: from the top of the section. Phone: a placeholder inside the page's
    // centred group, so the group (and with it the wordmark) moves with the layout; set before it is read.
    section.style.setProperty("--landing-mark", `${onBox ? Math.round(fontSize * 0.84) : wordmarkSpace(fontSize)}px`);
    const box = onBox ? content.querySelector<HTMLElement>('[data-landing="mark-box"]') : null;
    const textWidth = g.measureText("90").width + g.measureText("x").width;
    const origin = box
      ? {
          left: (width - textWidth) / 2,
          baseline: box.getBoundingClientRect().top - section.getBoundingClientRect().top + fontSize * 0.79,
        }
      : { left, baseline: 32 + fontSize * 0.78 };
    // "90" is drawn red and "x" green: the channel says which letter a dot belongs to.
    g.fillStyle = "#f00";
    g.fillText("90", origin.left, origin.baseline);
    g.fillStyle = "#0f0";
    g.fillText("x", origin.left + g.measureText("90").width, origin.baseline);
    const pixels = g.getImageData(0, 0, width, height).data;

    const grid: Array<{ x: number; y: number; type: 0 | 1 | 2 }> = [];
    for (let y = step / 2; y < height; y += step) {
      for (let x = step / 2; x < width; x += step) {
        const i = ((y | 0) * width + (x | 0)) * 4;
        grid.push({ x, y, type: pixels[i]! > 128 ? 1 : pixels[i + 1]! > 128 ? 2 : 0 });
      }
    }
    // On a phone two of every three letter dots are left to the static canvas alone: the overlay
    // brings in a particle for the rest, and the wordmark it hands over to has just those.
    const lettered = grid.filter((dot) => dot.type);
    const keep = narrow && !options.still ? thin(lettered.length, PHONE_PARTICLE_SHARE) : lettered.map(() => true);
    let n = 0;
    dots = grid.map((dot) => ({ ...dot, hasParticle: dot.type ? keep[n++]! : false }));

    field = document.createElement("canvas");
    field.width = width * dpr;
    field.height = height * dpr;
    const f = field.getContext("2d")!;
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    f.fillStyle = FIELD[0];
    f.beginPath();
    for (const dot of dots) {
      if (dot.type) continue;
      f.moveTo(dot.x + 1, dot.y);
      f.arc(dot.x, dot.y, 1, 0, Math.PI * 2);
    }
    f.fill();

    publishWordmark({ step, dots, fontSize });
    draw(performance.now());
  }

  function draw(now: number) {
    if (!field || !width) return;
    const t = now - start;
    let at: { x: number; y: number } | null = cursor && now - cursor.at < CURSOR_MS ? cursor : null;
    // With nothing pointing, a stand-in cursor wanders the field. Not on a phone: there is no cursor, and a lit patch of field drifting about beside the letters reads as a stray fragment.
    if (!options.still && !at && !isNarrow(width))
      at = { x: width * (0.5 + 0.38 * Math.sin(t / 2300)), y: height * (0.3 + 0.18 * Math.sin(t / 1700)) };
    if (options.still) at = null;
    const reach = isNarrow(width) ? 90 : 150;
    // The wordmark glitches on Ren's 5.2s rhythm, offset by half of it so the two take turns.
    const phase = (t + 2600) % 5200;
    const frameNo = Math.floor(t / 45);
    const glitch = !options.still && (phase < 140 || (phase > 240 && phase < 320));
    const lit: Dots = new Map();
    // The letters show unless the overlay is carrying them. When it hands them over, every dot shows: the ones it brought a particle to at once, the rest (a phone's other two thirds) fading in.
    const showLetters = !stage.lettersHidden;
    if (!showLetters) shownSince = -1;
    else if (shownSince < 0) shownSince = now;
    const fillIn = stage.overlay ? Math.min(1, (now - shownSince) / FILL_IN_MS) : 1;
    for (const dot of dots) {
      let near = 0;
      if (at) {
        const dx = dot.x - at.x;
        const dy = dot.y - at.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < reach * reach) near = 1 - Math.sqrt(d2) / reach;
      }
      if (dot.type) {
        if (!showLetters) continue;
        const row = Math.round(dot.y / step);
        const shift =
          glitch && (row * 31 + frameNo * 17) % 6 === 0
            ? ((row + frameNo) % 2 ? GLITCH_REACH_STEPS.right : -GLITCH_REACH_STEPS.left) * step
            : 0;
        const tint = shift && (Math.round(dot.x / step) + frameNo) % 3 === 0 ? GLITCH_COLORS[row % 2] : null;
        addDot(
          lit,
          tint ?? (dot.type === 2 ? INK_X : INK),
          dot.x + shift,
          dot.y,
          (step * 0.34 + near * step * 0.1) * (dot.hasParticle ? 1 : fillIn),
        );
      } else if (near > 0.2) {
        addDot(lit, FIELD[Math.min(4, Math.floor(near * 5))]!, dot.x, dot.y, 1 + near * 1.6);
      }
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(field, 0, 0, width, height);
    fillDots(ctx, lit);
  }

  const loop = throttledLoop(draw, () => !destroyed && visible && !options.still);

  const onMove = (event: PointerEvent) => {
    const box = section.getBoundingClientRect();
    cursor = { x: event.clientX - box.left, y: event.clientY - box.top, at: performance.now() };
  };
  if (!options.still) section.addEventListener("pointermove", onMove);

  const resize = new ResizeObserver(setup);
  const watch = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) loop.run();
  });

  // The letters are drawn from Sora; wait for it, or the dots would be sampled from a fallback face.
  void document.fonts
    .load(`700 100px ${family}`)
    .catch(() => undefined)
    .then(() => {
      if (destroyed) return;
      resize.observe(section);
      // On a phone the wordmark sits where its placeholder is, and the placeholder moves when the block under it
      // changes size (the footer, the sign-in notice) without the section resizing, so those are watched too.
      for (const part of content.querySelectorAll(":scope > *, :scope > * > *")) resize.observe(part);
      watch.observe(section);
    });

  return {
    destroy() {
      destroyed = true;
      loop.stop();
      resize.disconnect();
      watch.disconnect();
      section.removeEventListener("pointermove", onMove);
      publishWordmark(null);
    },
  };
}
