// The particle overlay: one canvas over the whole page, one particle for every dot of the
// final "90x". Ren breaks into them as the page starts to scroll; they gather round the
// card as it is answered and marked, circle the Feed wall's verdicts as if grading them,
// and fly into the wordmark at the close. Every position is worked out each frame from
// where the page's elements really are (getBoundingClientRect), so the particles stay
// locked to the content however it is laid out.
//
// No particle is drawn while the hero is in view once Ren is in. On a phone the story follows
// the page the scroll is on, and there are a third as many particles.
//
// Loaded with import() after first paint. Reduced motion never loads it.
import { addDot, type Dots, fillDots } from "./canvas";
import { REVIEW_STRIP } from "./demo";
import { isNarrow, pageIndex, storyForPage, wallPage } from "./pages";
import { arc, clamp01, easeFactor, easeInOut, perimeter, smoothstep, wrap01 } from "./particle-math";
import { type RenSource, renSources, tracksPointer } from "./ren";
import { seeded } from "./rng";
import { onStage, stage, type WordmarkDot } from "./stage";
import { storyAnchors, storyValue } from "./story";
import { sampleShape, seedFor, type Shape } from "./word-sampler";

const TAU = Math.PI * 2;
const OK = "#4ADE80";
const BAD = "#F87171";
/** The tails of the green and red ribbons: DESIGN.md's --x-ok-deep and --x-bad-deep. */
const OK_DEEP = "#1F4D33";
const BAD_DEEP = "#5A2525";
const CYAN = "#67E8F9";
const RED = "#FF3D68";
const INK = "#E6E9EF";
const MUTE_2 = "#5A6272";
const DARK_RED = "#6E1028";
/** A particle's shade of grey while it is not any other colour. */
const GREYS = ["#3E4553", "#5A6272", "#7D8594", "#AEB5C2"] as const;
/** The close's visiting dots wear the wordmark's colours. */
const CLOSE_VISITORS = [INK, CYAN, RED] as const;
/** The intro's length, in milliseconds. */
const INTRO_MS = 1900;
/** What the card's side shows as the demo goes on: a question mark, the score, the booked days. */
const SHAPES = ["?", "100%", "1·30"] as const;
/**
 * How tall a label is drawn, as a share of its area, on a wide screen and on a phone (whose area is
 * under 160px tall). "1·30" is short, so at full height its strokes are wide and the dots spread
 * thin over them; drawn a little smaller, the same dots read clearly.
 */
const SHAPE_HEIGHT: Partial<Record<(typeof SHAPES)[number], { wide: number; phone: number }>> = { "1·30": { wide: 0.72, phone: 0.85 } };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The top, relative to the top of the page's root. */
  dy: number;
}

/** Where something is drawn: a position that eases towards where it should be. */
interface Placed {
  sx: number;
  sy: number;
  placed: boolean;
}

interface Particle extends Placed {
  /** Where it starts: a cell of Ren's face. */
  src: RenSource;
  /** Where it ends: a dot of the wordmark. */
  dot: WordmarkDot;
  k: number;
  /** Stagger, 0 to 1. */
  d: number;
  /** Position along a path, 0 to 1. */
  u: number;
  /** Sideways offset, -1 to 1. */
  j: number;
  grey: string;
  /** One in ten keeps the hot red throughout. */
  red: boolean;
}

interface IntroParticle {
  src: RenSource;
  angle: number;
  radius: number;
  d: number;
  spin: number;
}

/** A visiting dot: it leaves a spot on the wordmark, curves out onto a button's edge, glides round it, and goes home. */
interface Visitor extends Placed {
  period: number;
  offset: number;
  seed: number;
  r: number;
  bend: number;
  dir: 1 | -1;
  u: number;
}

function paint(ctx: CanvasRenderingContext2D, width: number, height: number, dots: Dots, alpha: number) {
  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = alpha;
  fillDots(ctx, dots, 0.05);
  ctx.globalAlpha = 1;
}

/** Draws a label on a hidden canvas, blurred a little, and scatters dots over it. */
function rasterShape(label: (typeof SHAPES)[number], width: number, height: number, maxDots: number, family: string): Shape {
  const picture = document.createElement("canvas");
  picture.width = Math.ceil(width);
  picture.height = Math.ceil(height);
  const g = picture.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#fff";
  let size = height * (SHAPE_HEIGHT[label]?.[height >= 160 ? "wide" : "phone"] ?? 0.95);
  g.font = `700 ${size}px ${family}`;
  const measured = g.measureText(label).width;
  if (measured > width * 0.96) size *= (width * 0.96) / measured;
  g.font = `700 ${size}px ${family}`;
  g.textBaseline = "middle";
  g.filter = `blur(${Math.max(2, size * 0.035)}px)`;
  g.fillText(label, 4, height / 2);
  const pixels = g.getImageData(0, 0, picture.width, picture.height).data;
  const alpha = new Uint8ClampedArray(picture.width * picture.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3]!;
  return sampleShape(alpha, picture.width, picture.height, maxDots, seedFor(label));
}

const overCta = (target: EventTarget | null) => target instanceof Element && target.closest("[data-cta='close']") !== null;
/** Smooth start and end, for a visitor's curve out onto a button and back. */
const soft = (e: number) => e * e * (3 - 2 * e);
const q = <T extends Element>(selector: string): T | null => document.querySelector<T>(selector);
const qa = <T extends Element>(selector: string, within: ParentNode = document): T[] => [...within.querySelectorAll<T>(selector)];

/** Eases a drawn position towards where it should be; the first time it simply lands there. */
function settle(thing: Placed, x: number, y: number, k: number) {
  if (!thing.placed) {
    thing.sx = x;
    thing.sy = y;
    thing.placed = true;
  } else {
    thing.sx += (x - thing.sx) * k;
    thing.sy += (y - thing.sy) * k;
  }
}

export function startParticles(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d")!;
  const root = q<HTMLElement>('[data-landing="root"]')!;
  const family = getComputedStyle(root).getPropertyValue("--font-sora").trim() || "sans-serif";
  const renEl = q<HTMLCanvasElement>('[data-landing="ren"]');

  let width = 0;
  let narrow = false;
  let height = 0;
  let intro: IntroParticle[] = [];
  let letters: WordmarkDot[] = [];
  let parts: Particle[] = [];
  let closeVisitors: Visitor[] = [];
  let ready = false;

  let introStart: number | null = null;
  let introDone = false;
  let lastFrame = 0;
  let story: number | null = null;
  let progress: number | null = null;
  let hover = 0;
  let hovering = false;
  let lettersWeight = 0;
  let visitorsStart = 0;
  let pointer: { x: number; y: number; at: number } | null = null;
  let shapes: Shape[] | null = null;
  let shapesKey = "";
  let raf = 0;
  let destroyed = false;
  const hero = q<HTMLElement>('[data-landing="hero"]');
  const visible = new Set<Element>(hero ? [hero] : []);

  function setup() {
    const renInfo = stage.ren;
    const mark = stage.mark;
    if (!renInfo || !mark) return;
    width = root.offsetWidth;
    height = canvas.clientHeight || window.innerHeight;
    if (!width || !height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const random = seeded(1337);
    const sources = renSources(renInfo.grid, renInfo.width, renInfo.height);
    narrow = isNarrow(width);
    found.clear();
    intro = sources.map((src) => ({
      src,
      angle: random() * TAU,
      radius: 160 + random() * 520,
      d: random() * 0.35,
      spin: (random() < 0.5 ? -1 : 1) * (0.6 + random() * 0.9),
    }));
    letters = mark.dots.filter((dot) => dot.type);
    for (let n = sources.length - 1; n > 0; n--) {
      const m = Math.floor(random() * (n + 1));
      [sources[n], sources[m]] = [sources[m]!, sources[n]!];
    }
    // One particle for every letter dot that has one: all of them, except on a phone, where a third are kept.
    parts = letters
      .filter((dot) => dot.hasParticle)
      .map((dot, k) => ({
        src: sources[k % sources.length]!,
        dot,
        k,
        d: random(),
        u: random(),
        j: random() * 2 - 1,
        grey: GREYS[Math.floor(random() * 4)]!,
        red: random() < 0.1,
        sx: 0,
        sy: 0,
        placed: false,
      }));
    const visiting = (n: number): Visitor[] =>
      Array.from({ length: n }, () => ({
        period: 15 + random() * 8,
        offset: random() * 22,
        seed: Math.floor(random() * 100000),
        r: 1.7 + random() * 1.1,
        bend: random() * 2 - 1,
        dir: random() < 0.5 ? -1 : 1,
        u: random(),
        sx: 0,
        sy: 0,
        placed: false,
      }));
    // None on a phone: dots roaming about beside the wordmark added nothing and read as strays.
    closeVisitors = visiting(narrow ? 0 : 5);
    ready = true;
  }

  /** Where an element is in the overlay's own pixels, and its top relative to the page's root. */
  function measure() {
    const rootBox = root.getBoundingClientRect();
    const scale = rootBox.width / root.offsetWidth || 1;
    const origin = canvas.getBoundingClientRect();
    const locate = (el: Element): Rect => {
      const b = el.getBoundingClientRect();
      return {
        x: (b.left - origin.left) / scale,
        y: (b.top - origin.top) / scale,
        w: b.width / scale,
        h: b.height / scale,
        dy: (b.top - rootBox.top) / scale,
      };
    };
    return { rootBox, scale, origin, locate };
  }

  interface Clock {
    /** Seconds. */
    t: number;
    /** The spring factor for a drawn position this frame. */
    kp: number;
    mouse: { x: number; y: number } | null;
    paths: Dots;
  }

  /** The visiting dots: a few per section, each on its own 15 to 23 second cycle, out for about a third of it. */
  function visit(
    list: Visitor[],
    points: readonly { x: number; y: number }[],
    origin: { x: number; y: number },
    targets: Rect[],
    colors: readonly string[],
    amp: number,
    hoverRect: Rect | undefined,
    c: Clock,
  ) {
    if (!points.length || !targets.length || amp <= 0.01) return;
    const t0 = visitorsStart / 1000;
    list.forEach((p, i) => {
      const tt = c.t - t0 + p.offset * 0.6 - 0.5;
      if (tt < 0) return;
      const cycle = Math.floor(tt / p.period);
      const at = (((tt / p.period) % 1) + 1) % 1;
      const from = points[Math.abs(p.seed + cycle * 131) % points.length]!;
      const to = points[Math.abs(p.seed * 7 + cycle * 71 + 13) % points.length]!;
      const target = targets[Math.abs(p.seed + cycle) % targets.length]!;
      const edge = (u: number) => perimeter(target.x - 7, target.y - 7, target.w + 14, target.h + 14, wrap01(u));
      const u0 = p.u + cycle * 0.37;
      const ax = origin.x + from.x;
      const ay = origin.y + from.y;
      const bx = origin.x + to.x;
      const by = origin.y + to.y;
      let x: number;
      let y: number;
      let r: number;
      if (at < 0.1) {
        const e = at / 0.1;
        const [tx, ty] = edge(u0 + 0.06 * (e - 1) * p.dir);
        [x, y] = arc(ax, ay, tx, ty, p.bend, soft(e));
        r = p.r * smoothstep(0, 0.3, e);
      } else if (at < 0.24) {
        [x, y] = edge(u0 + ((at - 0.1) / 0.14) * 0.55 * p.dir);
        r = p.r;
      } else if (at < 0.36) {
        const e = (at - 0.24) / 0.12;
        const [tx, ty] = edge(u0 + (0.55 + 0.06 * e) * p.dir);
        [x, y] = arc(tx, ty, bx, by, p.bend, soft(e));
        r = p.r * (1 - smoothstep(0.75, 1, e));
      } else {
        x = bx;
        y = by;
        r = 0;
      }
      // A real mouse over a button draws every visitor to its edge.
      if (hoverRect && hover > 0.001) {
        const [hx, hy] = perimeter(
          hoverRect.x - 10,
          hoverRect.y - 10,
          hoverRect.w + 20,
          hoverRect.h + 20,
          (p.u + i * 0.1 + c.t * 0.08) % 1,
        );
        x += (hx - x) * hover;
        y += (hy - y) * hover;
        r = Math.max(r, p.r * hover);
      }
      // And they keep out of the cursor's way.
      if (c.mouse) {
        const dx = x - c.mouse.x;
        const dy = y - c.mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 100 && dist > 0.1) {
          const push = ((100 - dist) / 100) * 36;
          x += (dx / dist) * push;
          y += (dy / dist) * push;
        }
      }
      // A hidden visitor is not eased, so it appears where it starts.
      if (r <= 0.05) p.placed = false;
      settle(p, x, y, c.kp);
      if (r > 0.05) addDot(c.paths, colors[p.seed % colors.length]!, p.sx, p.sy, r * amp);
    });
  }

  /** The page's elements the frame follows, looked up once and again only if one has left the page; setup() clears it. */
  const found = new Map<string, Element>();
  function find<T extends Element>(selector: string): T | null {
    const hit = found.get(selector);
    if (hit?.isConnected) return hit as T;
    const el = q<T>(selector);
    if (el) found.set(selector, el);
    else found.delete(selector);
    return el;
  }

  /** Draws one frame. Returns true when nothing is moving, so the loop can rest until the page scrolls or resizes. */
  function frame(now: number): boolean {
    if (!ready || !root.isConnected) return false;
    const { rootBox, scale, origin, locate } = measure();
    const stageEl = find<HTMLElement>('[data-landing="ren-stage"]');
    const closeEl = find<HTMLElement>('[data-landing="close"]');
    const mark = stage.mark;
    if (!stageEl || !closeEl || !mark) return false;
    const S = locate(stageEl);
    const D = locate(closeEl);
    const elapsed = lastFrame ? Math.min(100, now - lastFrame) : 16;
    lastFrame = now;
    const kf = easeFactor(elapsed, 80);
    const kp = easeFactor(elapsed, 55);
    const kfPhone = easeFactor(elapsed, 200);

    // The load intro: particles spiral in from all round and land as Ren's cells, and Ren fades in under them.
    if (!introDone) {
      if (introStart === null) introStart = now;
      const p = Math.min(1, (now - introStart) / INTRO_MS);
      if (p >= 1) introDone = true;
      const fade = clamp01((p - 0.7) / 0.3);
      if (renEl) renEl.style.opacity = String(fade);
      const paths: Dots = new Map();
      for (const it of intro) {
        const e = 1 - Math.pow(1 - clamp01((p - it.d) / (0.85 - it.d)), 3);
        const angle = it.angle + it.spin * (1 - e) * 2.2;
        const radius = it.radius * (1 - e);
        addDot(
          paths,
          e < 0.55 ? DARK_RED : it.src.color,
          S.x + it.src.x + Math.cos(angle) * radius,
          S.y + it.src.y + Math.sin(angle) * radius * 0.7,
          it.src.r * (0.5 + 0.5 * e),
        );
      }
      paint(ctx, width, height, paths, 1 - fade);
      visitorsStart = now;
      canvas.dataset.state = "intro";
      return false;
    }

    const viewport = height;
    const y = Math.max(0, -rootBox.top) / scale;
    // The phone's pages are the screens; the page the scroll is on picks what the particles hold.
    const heroPage = narrow ? find<HTMLElement>('[data-page="hero"]') : null;
    const page = narrow ? pageIndex(y, heroPage ? locate(heroPage).h : viewport) : 0;
    const demoEl = find<HTMLElement>(narrow ? '[data-page="demo"]' : '[data-landing="demo"]');
    const wallEl = find<HTMLElement>(narrow ? `[data-page="${wallPage(page)}"]` : '[data-landing="feed-wall"]');
    const cardEl = find<HTMLElement>(narrow ? '[data-landing="demo-phone-card"]' : '[data-landing="demo-card"]');
    const vizEl = narrow ? null : find<HTMLElement>('[data-landing="demo-viz"]');
    const SB = demoEl ? locate(demoEl) : null;
    const WL = wallEl ? locate(wallEl) : null;
    const CD = cardEl ? locate(cardEl) : null;
    const VZ = vizEl ? locate(vizEl) : null;

    const rawStory = narrow
      ? storyForPage(page)
      : storyValue(
          y,
          storyAnchors({
            demoTop: SB ? SB.dy : null,
            demoHeight: SB ? SB.h : 0,
            wallTop: WL ? WL.dy : null,
            closeTop: D.dy,
            wordmarkHeight: 32 + mark.fontSize * 0.82,
            pageHeight: root.offsetHeight,
            viewport,
          }),
        );
    story = story === null ? rawStory : story + (rawStory - story) * (narrow ? kfPhone : kf);
    if (Math.abs(rawStory - story) < (narrow ? 0.02 : 0.0015)) story = rawStory;
    const sv = story;
    const rawProgress = !narrow && SB ? clamp01(-SB.y / Math.max(1, SB.h - viewport)) : 0;
    progress = progress === null ? rawProgress : progress + (rawProgress - progress) * kf;
    const sp = progress;
    const phoneStep = Number(cardEl?.dataset.step ?? 0);
    const phoneRight = cardEl?.dataset.outcome !== "wrong";

    const t = now / 1000;
    const paths: Dots = new Map();
    hover += ((hovering ? 1 : 0) - hover) * kf;
    const mouse = pointer && now - pointer.at < 2500 ? { x: (pointer.x - origin.left) / scale, y: (pointer.y - origin.top) / scale } : null;
    const clock: Clock = { t, kp, mouse, paths };

    // Ren's own canvas gives way as the story starts. While the hero is in view and the story is 0 nothing is drawn.
    if (renEl) renEl.style.opacity = String(1 - clamp01(sv * 5));

    if (sv <= 0) {
      lettersWeight = 0;
      stage.lettersHidden = true;
      for (const part of parts) part.placed = false;
      paint(ctx, width, height, paths, 1);
      canvas.dataset.state = "hero";
      return true;
    }

    const marked = sp >= 0.45;
    const flow = t * 55;
    const dotRadius = mark.step * 0.34;
    const choice = qa<HTMLElement>('[data-landing="demo-choice"]')[1];
    const verdictEl = q<HTMLElement>('[data-landing="demo-verdict"]');
    const days = qa<HTMLElement>('[data-landing="demo-day"]');
    const choiceRect = cardEl && choice ? locate(choice) : null;
    const verdictRect = cardEl && verdictEl ? locate(verdictEl) : null;
    const booked = cardEl ? REVIEW_STRIP.days.map((day) => days[day]).filter((el): el is HTMLElement => Boolean(el)) : [];
    const bookedRects = booked.length === REVIEW_STRIP.days.length ? booked.map(locate) : null;

    // Between the cards: the gaps down the wall's columns (wide) or along its rows (phone), and the verdict pills in view.
    let gutters: number[] | null = null;
    let pills: { box: Rect; color: string }[] | null = null;
    if (WL && wallEl) {
      if (!narrow) {
        const columns = width >= 980 ? 3 : 2;
        const columnWidth = (WL.w - 14 * (columns - 1)) / columns;
        gutters = [];
        for (let g = 0; g <= columns; g++) gutters.push(WL.x + g * (columnWidth + 14) - 7 + (g === 0 ? -10 : g === columns ? 10 : 0));
      } else gutters = [WL.x + 7, WL.x + WL.w - 7];
      if (!narrow && sv > 1.05) {
        pills = [];
        for (const card of qa<HTMLElement>("[data-wall-column] > div > div", wallEl)) {
          const pill = card.lastElementChild as HTMLElement | null;
          if (!pill) continue;
          const box = locate(pill);
          if (
            box.y > Math.max(0, WL.y + 50) &&
            box.y < Math.min(height, WL.y + WL.h - 50) &&
            box.x > WL.x + 10 &&
            box.x + box.w < WL.x + WL.w - 10
          ) {
            pills.push({ box, color: pill.dataset.tone === "bad" ? BAD : OK });
          }
        }
      }
    }

    // The area beside the steps draws a big question mark, then the score, then the days, in dots.
    // A phone has fewer particles to go round, so the ribbon takes fewer and the words keep enough to read.
    const cardDots = narrow ? 80 : 220;
    const total = parts.length;
    const inDemo = sv > 0.2 && sv < 1.8;
    if (VZ && VZ.h > 40 && inDemo) {
      const key = `${Math.round(VZ.w)}x${Math.round(VZ.h)}:${total - cardDots}`;
      if (shapesKey !== key) {
        shapesKey = key;
        shapes = SHAPES.map((label) => rasterShape(label, VZ.w, VZ.h, total - cardDots, family));
      }
    }
    const words = VZ && VZ.h > 40 && inDemo && shapes && shapes.every((shape) => shape.dots.length) ? shapes : null;

    // A ribbon of particles trails round whatever the demo is looking at: the question, the answer, the verdict, the strip.
    let ribbonStroke: readonly [string, string, string] = [CYAN, "#3FB6C6", "#1F5C66"];
    let path: ((u: number) => readonly [number, number]) | null = null;
    let ribbonHead = 0;
    let ribbonSpan = 0.6;
    if (CD && inDemo) {
      if (narrow) {
        path = (u) => perimeter(CD.x - 8, CD.y - 8, CD.w + 16, CD.h + 16, wrap01(u));
        ribbonHead = t * 0.2;
        ribbonSpan = 0.8;
        if (phoneStep >= 1) ribbonStroke = phoneRight ? [OK, OK, OK_DEEP] : [BAD, BAD, BAD_DEEP];
      } else if (sp < 0.2) {
        const prompt = q<HTMLElement>('[data-landing="demo-prompt"]');
        if (prompt) {
          const range = document.createRange();
          range.selectNodeContents(prompt);
          const lines = [...range.getClientRects()]
            .map((b) => ({ x: (b.left - origin.left) / scale, y: (b.top - origin.top) / scale, w: b.width / scale, h: b.height / scale }))
            .filter((b) => b.w > 4);
          const sum = lines.reduce((acc, b) => acc + b.w, 0);
          if (sum) {
            path = (u) => {
              let pos = wrap01(u) * sum;
              let li = 0;
              while (li < lines.length - 1 && pos > lines[li]!.w) {
                pos -= lines[li]!.w;
                li++;
              }
              const line = lines[li]!;
              return [line.x + Math.min(pos, line.w), line.y + line.h - 1];
            };
            ribbonHead = t * 0.16;
            ribbonSpan = 0.4;
          }
        }
      } else if (sp < 0.45 && choiceRect) {
        path = (u) => perimeter(choiceRect.x - 8, choiceRect.y - 8, choiceRect.w + 16, choiceRect.h + 16, wrap01(u));
        ribbonHead = t * 0.3;
        ribbonSpan = 0.7;
      } else if (sp < 0.68 && verdictRect) {
        path = (u) => perimeter(verdictRect.x - 10, verdictRect.y - 10, verdictRect.w + 20, verdictRect.h + 20, wrap01(u));
        ribbonHead = t * 0.22;
        ribbonSpan = 0.75;
        ribbonStroke = [OK, OK, OK_DEEP];
      } else {
        const grid = q('[data-landing="demo-strip"]')?.firstElementChild;
        const gridRect = grid ? locate(grid) : null;
        if (gridRect) {
          path = (u) => perimeter(gridRect.x - 8, gridRect.y - 8, gridRect.w + 16, gridRect.h + 16, wrap01(u));
          ribbonHead = t * 0.25;
          ribbonSpan = 0.8;
        }
      }
    }
    const ribbonCount = Math.floor(total * 0.45);

    let farthest = 0;
    for (const part of parts) {
      const delay = 0.3 * part.d;
      const e1 = easeInOut(clamp01((sv - delay) / 0.7));
      const e2 = easeInOut(clamp01((sv - 1 - delay) / 0.7));
      const e3 = easeInOut(clamp01((sv - 2 - delay) / 0.7));
      let px = S.x + part.src.x;
      let py = S.y + part.src.y;
      let r = part.src.r;
      let color = part.src.color;
      let wraps = false;
      let ribbon = false;

      // Leg one: the demo.
      if (e1 > 0 && CD) {
        let tx: number;
        let ty: number;
        let c1: string;
        let r1 = 1.4;
        if (words && part.k >= total - cardDots) {
          // The last particles visit the card itself: a loose band round it, then the picked answer, then the booked days.
          const pickIn = smoothstep(0.18 + part.d * 0.04, 0.24 + part.d * 0.04, sp);
          const bookIn = smoothstep(0.68 + part.d * 0.04, 0.74 + part.d * 0.04, sp);
          const wobble = part.d * TAU;
          const jj = (part.j + 1) / 2;
          const pad = 16 + jj * 28;
          [tx, ty] = perimeter(CD.x - pad, CD.y - pad, CD.w + pad * 2, CD.h + pad * 2, (part.u + t * 0.006) % 1);
          tx += Math.sin(t * 0.7 + wobble) * 6;
          ty += Math.cos(t * 0.6 + wobble) * 6;
          c1 = part.red ? RED : MUTE_2;
          r1 = 1.3;
          if (choiceRect && pickIn > 0) {
            const band = 3 + jj * 6;
            const [ox, oy] = perimeter(
              choiceRect.x - band,
              choiceRect.y - band,
              choiceRect.w + band * 2,
              choiceRect.h + band * 2,
              (part.u + t * 0.04) % 1,
            );
            tx += (ox - tx) * pickIn;
            ty += (oy - ty) * pickIn;
            if (pickIn > 0.5) c1 = marked ? OK : CYAN;
          }
          if (bookedRects && bookIn > 0) {
            const target = bookedRects[part.k % bookedRects.length]!;
            const angle = wobble + t * 1.2;
            const orbit = target.w * 0.5 + 4 + jj * 5;
            tx += (target.x + target.w / 2 + Math.cos(angle) * orbit - tx) * bookIn;
            ty += (target.y + target.h / 2 + Math.sin(angle) * orbit - ty) * bookIn;
            if (bookIn > 0.5) c1 = CYAN;
          }
        } else if (words) {
          const toTick = smoothstep(0.42 + part.d * 0.06, 0.46 + part.d * 0.06, sp);
          const toDays = smoothstep(0.65 + part.d * 0.06, 0.69 + part.d * 0.06, sp);
          const pick = (shape: Shape) => {
            const dot = shape.dots[part.k % shape.dots.length]!;
            return {
              x: VZ!.x + dot.x + Math.sin(t * 0.8 + dot.phase) * 1.6,
              y: VZ!.y + dot.y + Math.cos(t * 0.7 + dot.phase) * 1.6,
              r: part.k < shape.dots.length ? Math.max(0.9, Math.min(2.6, shape.spacing * 0.3 * dot.size)) : 0,
            };
          };
          const a = pick(words[0]!);
          const b = pick(words[1]!);
          const d = pick(words[2]!);
          tx = a.x + (b.x - a.x) * toTick;
          ty = a.y + (b.y - a.y) * toTick;
          r1 = a.r + (b.r - a.r) * toTick;
          tx += (d.x - tx) * toDays;
          ty += (d.y - ty) * toDays;
          r1 += (d.r - r1) * toDays;
          const bow = Math.sin(toTick * Math.PI) + Math.sin(toDays * Math.PI);
          tx += bow * 46 * part.j + Math.sin(t * 2 + part.k) * 0.5;
          ty += bow * 30 * Math.sin(part.k) + Math.cos(t * 1.7 + part.k) * 0.5;
          c1 = toDays > 0.5 ? (part.red ? RED : CYAN) : toTick > 0.5 ? OK : part.red ? RED : INK;
        } else if (path && part.k < ribbonCount) {
          const f = part.k / ribbonCount;
          const u = ribbonHead - f * ribbonSpan;
          const p = path(u);
          const n = path(u + 0.004);
          let nx = -(n[1] - p[1]);
          let ny = n[0] - p[0];
          const nl = Math.hypot(nx, ny) || 1;
          nx /= nl;
          ny /= nl;
          const off = part.j * (1 + f * 7);
          tx = p[0] + nx * off;
          ty = p[1] + ny * off;
          r1 = 0.6 + 1.8 * (1 - f);
          ribbon = true;
          c1 = f < 0.04 ? INK : part.red && f > 0.2 ? RED : f < 0.4 ? ribbonStroke[0] : f < 0.75 ? ribbonStroke[1] : ribbonStroke[2];
        } else {
          tx = CD.x + CD.w / 2 + part.j * CD.w * 0.4;
          ty = CD.y + CD.h / 2 + (part.u - 0.5) * CD.h * 0.6;
          r1 = 0;
          c1 = part.grey;
        }
        px += (tx - px) * e1 + Math.sin(e1 * Math.PI) * (narrow ? 18 : 90) * part.j;
        py += (ty - py) * e1;
        r += (r1 - r) * e1;
        if (e1 > 0.5) color = c1;
      }

      // Leg two: the Feed wall. Some circle a verdict pill in its own colour, as if grading it; the rest flow down the gaps between cards.
      if (e2 > 0 && WL) {
        let gx: number;
        let gy: number;
        let c2: string;
        let r2: number;
        if (part.d < 0.4 && pills && pills.length) {
          const pill = pills[(part.k * 7) % pills.length]!;
          const angle = part.u * TAU + t * 1.6;
          gx = pill.box.x + pill.box.w / 2 + Math.cos(angle) * (pill.box.w / 2 + 9);
          gy = pill.box.y + pill.box.h / 2 + Math.sin(angle) * (pill.box.h / 2 + 8);
          c2 = pill.color;
          r2 = 1.4;
        } else {
          const lines = gutters ?? [WL.x];
          gx = (lines[part.k % lines.length] ?? WL.x) + part.j * 3;
          gy = WL.y + ((part.u * WL.h + flow) % WL.h);
          const fade = clamp01(Math.min(gy - WL.y, WL.y + WL.h - gy) / 60);
          c2 = part.red ? RED : part.u > 0.88 ? CYAN : part.grey;
          r2 = 1.3 * fade;
          wraps = true;
        }
        px += (gx - px) * e2 + Math.sin(e2 * Math.PI) * (narrow ? 18 : 90) * part.j;
        py += (gy - py) * e2;
        r += (r2 - r) * e2;
        if (e2 > 0.5) color = c2;
      }

      // Leg three: each flies to its own dot of the wordmark.
      if (e3 > 0) {
        px += (D.x + part.dot.x - px) * e3 + Math.sin(e3 * Math.PI) * (narrow ? 14 : 70) * part.j;
        py += (D.y + part.dot.y - py) * e3;
        r += (dotRadius - r) * e3;
        if (e3 > 0.6) color = part.dot.type === 2 ? CYAN : INK;
      }

      // A particle springs to where it should be, except when it wraps round a looping path: then it snaps, rather than flying the width of the wall.
      const snaps =
        ((wraps && e3 === 0 && e2 >= 1) || (ribbon && e1 >= 1 && e2 === 0)) && Math.abs(px - part.sx) + Math.abs(py - part.sy) > 160;
      if (snaps) part.placed = false;
      settle(part, px, py, kp);
      farthest = Math.max(farthest, Math.abs(px - part.sx) + Math.abs(py - part.sy));
      if (part.sy < -20 || part.sy > height + 20) continue;
      addDot(paths, color, part.sx, part.sy, r);
    }

    // At the close, once every particle has settled within a pixel, the wordmark's own canvas takes over.
    if (sv >= 3 && farthest < 1) {
      stage.lettersHidden = false;
      paths.clear();
      lettersWeight += (1 - lettersWeight) * kf;
      const closeTargets = [q('[data-cta="close"]'), q('[data-cta="close"]'), q('[data-landing="day-one"]')]
        .filter((el): el is Element => el !== null)
        .map(locate);
      visit(closeVisitors, letters, D, closeTargets, CLOSE_VISITORS, lettersWeight, closeTargets[0], clock);
      paint(ctx, width, height, paths, 1);
      canvas.dataset.state = "wordmark";
      // A phone has no visiting dots: the wordmark's own canvas is all that moves, so the overlay can rest.
      return closeVisitors.length === 0;
    }
    lettersWeight = 0;
    stage.lettersHidden = true;
    paint(ctx, width, height, paths, 1);
    canvas.dataset.state = "story";
    return false;
  }

  function loop(now: number) {
    raf = 0;
    if (destroyed || !(visible.size > 0 || !introDone)) return;
    if (!frame(now)) raf = requestAnimationFrame(loop);
  }
  const run = () => {
    if (!raf && !destroyed) raf = requestAnimationFrame(loop);
  };

  // Only run while something the overlay acts on is on screen: the long page's four sections, or any of the phone's pages.
  const watch = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    run();
  });
  for (const el of qa('[data-landing="hero"], [data-landing="demo"], [data-landing="feed"], [data-landing="close"], [data-page]'))
    watch.observe(el);

  const onMove = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY, at: performance.now() };
  };
  // A finger leaves no pointer to follow; the overlay then only reacts to the story.
  if (tracksPointer((query) => window.matchMedia(query).matches)) hero?.addEventListener("pointermove", onMove);
  // A resting loop wakes when the page scrolls.
  document.addEventListener("scroll", run, { passive: true });
  // A real mouse over either sign-in button (hero or close) draws the visitors to it; a finger does not.
  const onOver = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && overCta(event.target)) hovering = true;
  };
  const onOut = (event: PointerEvent) => {
    if (overCta(event.target)) hovering = false;
  };
  document.addEventListener("pointerover", onOver);
  document.addEventListener("pointerout", onOut);

  let resizeTimer = 0;
  const resize = new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      setup();
      run();
    }, 120);
  });
  resize.observe(root);

  // Ren and the wordmark publish their geometry when they have drawn; the overlay needs both, and starts over when either changes.
  const unsubscribe = onStage(() => {
    setup();
    run();
  });
  setup();
  stage.overlay = true;
  stage.lettersHidden = true;
  if (renEl) renEl.style.transition = "none";
  run();

  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(resizeTimer);
    watch.disconnect();
    resize.disconnect();
    unsubscribe();
    hero?.removeEventListener("pointermove", onMove);
    document.removeEventListener("scroll", run);
    document.removeEventListener("pointerover", onOver);
    document.removeEventListener("pointerout", onOut);
    stage.overlay = false;
    stage.lettersHidden = false;
    if (renEl) {
      renEl.style.opacity = "";
      renEl.style.transition = "";
    }
  };
}
