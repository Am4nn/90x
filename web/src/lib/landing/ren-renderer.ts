// Draws Ren onto a canvas. This module is loaded with import() after the page's
// first paint (see RenCanvas), so none of it is in the route's first bundle.
//
// Ren is 60 columns of text, redrawn 30 times a second while it is on screen. Each
// character is copied from a glyph atlas (one row per colour) drawn once, which is
// far cheaper than fillText for two thousand cells a frame.
import {
  breath,
  ease,
  eyeOpenness,
  glitchFrame,
  glitching,
  glitchGlyph,
  glitchShift,
  REN_CHARS,
  REN_COLORS,
  REN_GLITCH,
  REN_SHADOW,
  type RenCell,
  renGrid,
  renView,
  shadeCell,
  targetPose,
} from "./ren";

const FRAME_MS = 33;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));
/** The pointer steers Ren for this long after it last moved. */
const POINTER_MS = 3000;

export interface RenOptions {
  /** Reduced motion: draw one still frame, and again only when the size changes. */
  still: boolean;
}

export interface RenHandle {
  destroy(): void;
}

/** The family a CSS variable holds, e.g. next/font's `--font-jetbrains`, so the canvas uses the loaded face. */
function familyOf(element: Element, variable: string): string {
  return getComputedStyle(element).getPropertyValue(variable).trim() || "monospace";
}

interface Atlas {
  image: HTMLCanvasElement;
  /** Top-left of each colour + character pair in the image. */
  at: Map<string, [number, number]>;
  width: number;
  height: number;
}

function buildAtlas(family: string, cellW: number, cellH: number, dpr: number): Atlas {
  const width = Math.ceil(cellW * dpr);
  const height = Math.ceil(cellH * dpr);
  const image = document.createElement("canvas");
  image.width = width * REN_CHARS.length;
  image.height = height * REN_COLORS.length;
  const ctx = image.getContext("2d")!;
  ctx.font = `700 ${cellW * 1.62 * dpr}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const at = new Map<string, [number, number]>();
  REN_COLORS.forEach((color, row) => {
    ctx.fillStyle = color;
    [...REN_CHARS].forEach((char, column) => {
      ctx.fillText(char, column * width + width / 2, row * height + height / 2);
      at.set(color + char, [column * width, row * height]);
    });
  });
  return { image, at, width, height };
}

export function mountRen(canvas: HTMLCanvasElement, options: RenOptions): RenHandle {
  const box = canvas.parentElement!;
  const hero = canvas.closest<HTMLElement>('[data-landing="hero"]') ?? box;
  const family = familyOf(canvas, "--font-jetbrains");
  const ctx = canvas.getContext("2d")!;
  const start = performance.now();

  let width = 0;
  let height = 0;
  let grid = renGrid(1, 1);
  let atlas: Atlas | null = null;
  let yaw = 0;
  let pitch = 0;
  let pointer: { x: number; y: number; at: number } | null = null;
  let hovering = false;
  let visible = true;
  let frame = 0;
  let last = 0;
  let destroyed = false;
  let fontReady = false;
  const cell: RenCell = { char: "", color: "" };

  function size() {
    if (!fontReady) return;
    width = box.clientWidth;
    height = box.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    grid = renGrid(width, height);
    atlas = buildAtlas(family, grid.cw, grid.ch, dpr);
    draw(performance.now());
    canvas.dataset.ready = "true";
  }

  function draw(now: number) {
    if (!atlas || !width) return;
    const ms = options.still ? 0 : now - start;
    const live = pointer && now - pointer.at < POINTER_MS ? pointer : null;
    const target = targetPose(ms, live);
    yaw = ease(yaw, target.yaw);
    pitch = ease(pitch, target.pitch);
    const view = renView(yaw, pitch, eyeOpenness(ms));
    const radius = grid.radius * breath(ms);
    const glitch = !options.still && glitching(ms, hovering);
    const step = glitchFrame(ms);
    const { cols, rows, cw, ch } = grid;
    const { image, at, width: aw, height: ah } = atlas;
    ctx.clearRect(0, 0, width, height);
    for (let j = 0; j < rows; j++) {
      const y = ((j + 0.5) * ch - height / 2) / radius;
      const shift = glitch ? glitchShift(j, step) : 0;
      for (let i = 0; i < cols; i++) {
        const x = ((i - shift + 0.5) * cw - width / 2) / radius;
        if (!shadeCell(x, y, view, cell)) continue;
        let { char, color } = cell;
        if (shift && color !== REN_SHADOW) {
          const glyph = glitchGlyph(i, j, step);
          if (glyph) {
            char = glyph;
            color = REN_GLITCH;
          }
        }
        const source = at.get(color + char);
        if (source) ctx.drawImage(image, source[0], source[1], aw, ah, i * cw, j * ch, cw, ch);
      }
    }
  }

  function tick(now: number) {
    frame = 0;
    if (destroyed || !visible || options.still) return;
    if (now - last >= FRAME_MS) {
      last = now;
      draw(now);
    }
    frame = requestAnimationFrame(tick);
  }

  function run() {
    if (!frame && visible && !options.still && !destroyed) frame = requestAnimationFrame(tick);
  }

  const onMove = (event: PointerEvent) => {
    const rect = box.getBoundingClientRect();
    pointer = {
      x: clamp(((event.clientX - rect.left) / rect.width) * 2 - 1),
      y: clamp(((event.clientY - rect.top) / rect.height) * 2 - 1),
      at: performance.now(),
    };
  };
  // A real mouse over the sign-in button makes Ren glitch; a finger that touched it does not.
  const onOver = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && (event.target as Element).closest("[data-cta='hero']")) hovering = true;
  };
  const onOut = (event: PointerEvent) => {
    if ((event.target as Element).closest("[data-cta='hero']")) hovering = false;
  };
  if (!options.still) {
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerover", onOver);
    hero.addEventListener("pointerout", onOut);
  }

  const resize = new ResizeObserver(size);
  resize.observe(box);
  // Off screen, Ren is not redrawn.
  const watch = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) run();
  });
  watch.observe(box);

  // The atlas needs the face loaded; until it is, canvas text would use a fallback.
  void document.fonts
    .load(`700 16px ${family}`)
    .catch(() => undefined)
    .then(() => {
      if (destroyed) return;
      fontReady = true;
      size();
      run();
    });

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      watch.disconnect();
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerover", onOver);
      hero.removeEventListener("pointerout", onOut);
    },
  };
}
