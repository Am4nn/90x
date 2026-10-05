// A small stand-in for the browser, for the canvas and observer code under src/lib/landing.
// The unit tests run in plain Node (no jsdom), and these modules only need a handful of
// things: elements that can be found by attribute, a 2D context that records what is drawn
// (and can say which pixels got ink, for the code that samples a picture), observers that the
// test fires by hand, and a requestAnimationFrame that moves only when the test says so.
import { vi } from "vitest";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Call {
  name: string;
  args: number[];
  fillStyle: string;
}

interface Ink {
  x: number;
  y: number;
  w: number;
  h: number;
  rgb: [number, number, number];
}

const RGB: Record<string, [number, number, number]> = { "#f00": [255, 0, 0], "#0f0": [0, 255, 0], "#fff": [255, 255, 255] };

/** A 2D context that records its calls. Text and strokes leave "ink" so getImageData has something to read. */
export class FakeCtx {
  calls: Call[] = [];
  fillStyle = "#000";
  strokeStyle = "#000";
  globalAlpha = 1;
  font = "10px sans-serif";
  textAlign = "start";
  textBaseline = "alphabetic";
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "miter";
  filter = "none";
  private ink: Ink[] = [];
  private path: Array<[number, number]> = [];

  private record(name: string, args: unknown[]) {
    this.calls.push({ name, args: args as number[], fillStyle: this.fillStyle });
  }
  clearRect(...a: number[]) {
    this.record("clearRect", a);
  }
  setTransform(...a: number[]) {
    this.record("setTransform", a);
  }
  beginPath() {
    this.record("beginPath", []);
    this.path = [];
  }
  moveTo(x: number, y: number) {
    this.record("moveTo", [x, y]);
    this.path.push([x, y]);
  }
  lineTo(x: number, y: number) {
    this.record("lineTo", [x, y]);
    this.path.push([x, y]);
  }
  arc(...a: number[]) {
    this.record("arc", a);
  }
  fill() {
    this.record("fill", []);
  }
  drawImage(...a: unknown[]) {
    this.record("drawImage", a);
  }
  /** Strokes ink the bounding box of the path, which is all a test needs of a tick mark. */
  stroke() {
    this.record("stroke", []);
    if (!this.path.length) return;
    const xs = this.path.map((p) => p[0]);
    const ys = this.path.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    this.ink.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, rgb: RGB[this.strokeStyle] ?? [255, 255, 255] });
  }
  private size(): number {
    return Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
  }
  /** Every character is 0.6 of the font size wide. */
  measureText(text: string) {
    return { width: text.length * this.size() * 0.6 };
  }
  fillText(text: string, x: number, y: number) {
    this.record("fillText", [x, y]);
    const size = this.size();
    const top = this.textBaseline === "middle" ? y - size * 0.35 : y - size * 0.7;
    this.ink.push({ x, y: top, w: this.measureText(text).width, h: size * 0.7, rgb: RGB[this.fillStyle] ?? [255, 255, 255] });
  }
  getImageData(x: number, y: number, w: number, h: number) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (const rect of this.ink) {
      for (let j = Math.max(0, Math.floor(rect.y - y)); j < Math.min(h, Math.ceil(rect.y + rect.h - y)); j++) {
        for (let i = Math.max(0, Math.floor(rect.x - x)); i < Math.min(w, Math.ceil(rect.x + rect.w - x)); i++) {
          const at = (j * w + i) * 4;
          data.set([...rect.rgb, 255], at);
        }
      }
    }
    return { data, width: w, height: h };
  }

  /** The [x, y, radius] of every dot drawn since the last clearRect. */
  lastFrameDots(): Array<[number, number, number]> {
    const cleared = this.calls.map((c) => c.name).lastIndexOf("clearRect");
    return this.calls
      .slice(cleared + 1)
      .filter((c) => c.name === "arc")
      .map((c) => [c.args[0]!, c.args[1]!, c.args[2]!]);
  }
  /** The fill colours used since the last clearRect. */
  lastFrameColors(): Set<string> {
    const cleared = this.calls.map((c) => c.name).lastIndexOf("clearRect");
    return new Set(
      this.calls
        .slice(cleared + 1)
        .filter((c) => c.name === "fill")
        .map((c) => c.fillStyle),
    );
  }
}

type Listener = (event: unknown) => void;

function matches(el: FakeEl, selector: string): boolean {
  return selector.split(",").some((part) => {
    const m = /^\s*\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]\s*$/.exec(part);
    if (!m) return false;
    const have = el.attrs[m[1]!];
    return have !== undefined && (m[2] === undefined || have === m[2]);
  });
}

interface FakeStyle {
  transform?: string;
  opacity?: string;
  transition?: string;
  width?: string;
  height?: string;
  props: Record<string, string>;
  setProperty(name: string, value: string): void;
  removeProperty(name: string): void;
  getPropertyValue(name: string): string;
}

function makeStyle(): FakeStyle {
  const style: FakeStyle = {
    props: {},
    setProperty(name, value) {
      style.props[name] = value;
    },
    removeProperty(name) {
      delete style.props[name];
      delete (style as unknown as Record<string, unknown>)[name];
    },
    getPropertyValue: (name) => style.props[name] ?? "",
  };
  return style;
}

/** An element: found by `[attr]` or `[attr="value"]` selectors (comma lists too), with a box the test sets. */
export class FakeEl {
  dataset: Record<string, string> = {};
  style = makeStyle();
  children: FakeEl[] = [];
  parentElement: FakeEl | null = null;
  clientWidth = 0;
  clientHeight = 0;
  offsetWidth = 0;
  offsetHeight = 0;
  offsetTop = 0;
  offsetLeft = 0;
  width = 0;
  height = 0;
  box: Box = { left: 0, top: 0, width: 0, height: 0 };
  isConnected = true;
  /** What getComputedStyle reports: custom properties by name, plus flexDirection and paddingLeft. */
  computed: Record<string, string> = {};
  private listeners = new Map<string, Set<Listener>>();
  private context: FakeCtx | null = null;

  constructor(
    public tag = "div",
    public attrs: Record<string, string> = {},
  ) {
    for (const [name, value] of Object.entries(attrs)) {
      if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = value;
    }
  }

  get firstElementChild(): FakeEl | null {
    return this.children[0] ?? null;
  }
  get lastElementChild(): FakeEl | null {
    return this.children[this.children.length - 1] ?? null;
  }
  append<T extends FakeEl>(...kids: T[]): this {
    for (const kid of kids) {
      kid.parentElement = this;
      this.children.push(kid);
    }
    return this;
  }
  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type: string, event: Record<string, unknown> = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener({ target: this, ...event });
  }
  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
  getBoundingClientRect() {
    const { left, top, width, height } = this.box;
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
  }
  closest(selector: string): FakeEl | null {
    if (matches(this, selector)) return this;
    return this.parentElement?.closest(selector) ?? null;
  }
  querySelectorAll(selector: string): FakeEl[] {
    const out: FakeEl[] = [];
    const walk = (el: FakeEl) => {
      for (const child of el.children) {
        if (matches(child, selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  querySelector(selector: string): FakeEl | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  getContext(): FakeCtx {
    return (this.context ??= new FakeCtx());
  }
  /** The recording context of a canvas, for assertions. */
  get ctx(): FakeCtx {
    return this.getContext();
  }
}

class FakeObserver {
  static all: FakeObserver[] = [];
  targets = new Set<FakeEl>();
  disconnected = false;
  constructor(public callback: (entries: Array<{ target: FakeEl; isIntersecting: boolean }>) => void) {
    FakeObserver.all.push(this);
  }
  observe(el: FakeEl) {
    this.targets.add(el);
  }
  disconnect() {
    this.disconnected = true;
    this.targets.clear();
  }
}

export interface DomEnv {
  document: FakeEl & { createElement(tag: string): FakeEl };
  body: FakeEl;
  window: {
    scrollY: number;
    innerHeight: number;
    devicePixelRatio: number;
    media: Record<string, boolean>;
    scrollTo: ReturnType<typeof vi.fn>;
  };
  /** Current time in ms. */
  now: number;
  /** Moves the clock on `ms`, then runs every animation frame that was waiting. */
  frame(ms?: number): void;
  /** Runs `count` frames of `ms` each. */
  frames(count: number, ms?: number): void;
  /** Animation frames waiting to run. */
  pending(): number;
  /** Fires every IntersectionObserver that watches `el`. */
  intersect(el: FakeEl, isIntersecting: boolean): void;
  /** Fires every ResizeObserver that watches `el`. */
  resize(el: FakeEl): void;
  /** Observers not yet disconnected. */
  liveObservers(): number;
  /** Advances the fake setTimeout clock. */
  timers(ms: number): void;
  restore(): void;
}

/** Puts the fake browser in place as globals. Call `restore()` (an afterEach) to take it down. */
export function installDom(): DomEnv {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  FakeObserver.all = [];
  const queue = new Map<number, (now: number) => void>();
  let nextId = 1;
  const body = new FakeEl("body");
  const document = Object.assign(new FakeEl("document"), {
    createElement: (tag: string) => new FakeEl(tag),
    createRange: () => {
      let node: FakeEl | null = null;
      return {
        selectNodeContents(el: FakeEl) {
          node = el;
        },
        getClientRects: () => (node as (FakeEl & { lines?: Box[] }) | null)?.lines?.map((b) => ({ ...b })) ?? [],
      };
    },
    fonts: { load: () => Promise.resolve([]) },
  });
  document.append(body);
  const window = {
    scrollY: 0,
    innerHeight: 800,
    devicePixelRatio: 1,
    media: {} as Record<string, boolean>,
    setTimeout: (fn: () => void, ms?: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id?: number) => globalThis.clearTimeout(id),
    matchMedia: (query: string) => ({ matches: window.media[query] ?? false }),
    scrollTo: vi.fn(),
  };
  const env: DomEnv = {
    document,
    body,
    window,
    now: 0,
    frame(ms = 16) {
      env.now += ms;
      const due = [...queue.entries()];
      queue.clear();
      for (const [, callback] of due) callback(env.now);
    },
    frames(count, ms = 16) {
      for (let i = 0; i < count; i++) env.frame(ms);
    },
    pending: () => queue.size,
    intersect(el, isIntersecting) {
      for (const o of FakeObserver.all) if (o.targets.has(el)) o.callback([{ target: el, isIntersecting }]);
    },
    resize(el) {
      for (const o of FakeObserver.all) if (o.targets.has(el)) o.callback([]);
    },
    liveObservers: () => FakeObserver.all.filter((o) => !o.disconnected).length,
    timers: (ms) => vi.advanceTimersByTime(ms),
    restore() {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    },
  };
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", document);
  vi.stubGlobal("Element", FakeEl);
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("ResizeObserver", FakeObserver);
  vi.stubGlobal("getComputedStyle", (el: FakeEl) => ({
    getPropertyValue: (name: string) => el.computed[name] ?? "",
    flexDirection: el.computed.flexDirection ?? "",
    paddingLeft: el.computed.paddingLeft ?? "",
  }));
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => {
    const id = nextId++;
    queue.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
  vi.spyOn(performance, "now").mockImplementation(() => env.now);
  return env;
}

/** A pointer event's fields as the landing code reads them. */
export const pointer = (target: FakeEl, extra: Record<string, unknown> = {}) => ({ target, pointerType: "mouse", ...extra });
