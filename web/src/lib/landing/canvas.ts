// What Ren, the dot wordmark and the particle overlay share: sizing a canvas for the
// screen it is on, batching dots by colour, and a throttled draw loop.

/** Sizes a canvas to `width` by `height` CSS pixels, at up to twice the pixels on a dense screen, and draws in CSS pixels. Returns the pixel ratio. */
export function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, width: number, height: number): number {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
}

/** Dots grouped by colour, as x, y, radius triples, so each colour is one fill. */
export type Dots = Map<string, number[]>;

export function addDot(dots: Dots, color: string, x: number, y: number, r: number) {
  const list = dots.get(color);
  if (list) list.push(x, y, r);
  else dots.set(color, [x, y, r]);
}

/** Fills every dot, a colour at a time. Dots no bigger than `skipBelow` are not drawn. */
export function fillDots(ctx: CanvasRenderingContext2D, dots: Dots, skipBelow = 0) {
  for (const [color, list] of dots) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < list.length; i += 3) {
      const r = list[i + 2]!;
      if (r <= skipBelow) continue;
      ctx.moveTo(list[i]! + r, list[i + 1]!);
      ctx.arc(list[i]!, list[i + 1]!, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

/** A draw loop that runs at most every `frameMs` while `active()` says so. Call `run` when it may have become active; `stop` to end it. */
export function throttledLoop(draw: (now: number) => void, active: () => boolean, frameMs = 33) {
  let raf = 0;
  let last = 0;
  const tick = (now: number) => {
    raf = 0;
    if (!active()) return;
    if (now - last >= frameMs) {
      last = now;
      draw(now);
    }
    raf = requestAnimationFrame(tick);
  };
  return {
    run() {
      if (!raf) raf = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
