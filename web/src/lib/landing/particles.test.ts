import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DomEnv, FakeEl, installDom, pointer } from "../../test-support/fake-dom";
import { REVIEW_STRIP } from "./demo";
import { PHONE_PARTICLE_SHARE, thin } from "./particle-math";
import { startParticles } from "./particles";
import { renGrid, renSources } from "./ren";
import { publishRen, publishWordmark, stage, type WordmarkDot, type WordmarkInfo } from "./stage";
import { storyAnchors } from "./story";

const VIEWPORT = 800;
const PAGE = 6000;
const DEMO = { top: 900, height: 2400 };
const WALL_TOP = 3400;
const CLOSE_TOP = 4800;
const FONT_SIZE = 200;
const REN = { width: 600, height: 400 };
const OK = "#4ADE80";
const CYAN = "#67E8F9";

let env: DomEnv;
let stop: (() => void) | null = null;
beforeEach(() => {
  env = installDom();
  stage.overlay = false;
  stage.lettersHidden = false;
});
afterEach(() => {
  stop?.();
  stop = null;
  publishRen(null);
  publishWordmark(null);
  env.restore();
});

/** A wordmark of `count` letter dots on a grid, `keep(n)` deciding which have a particle, plus some background dots. */
function makeMark(count: number, keep: (n: number) => boolean = () => true): WordmarkInfo {
  const dots: WordmarkDot[] = [];
  for (let n = 0; n < count; n++) {
    dots.push({ x: 60 + (n % 25) * 11, y: 60 + Math.floor(n / 25) * 11, type: n % 3 === 0 ? 2 : 1, hasParticle: keep(n) });
  }
  for (let n = 0; n < 30; n++) dots.push({ x: 5 + n * 11, y: 5, type: 0, hasParticle: false });
  return { step: 11, dots, fontSize: FONT_SIZE };
}

interface Page {
  root: FakeEl;
  canvas: FakeEl;
  ren: FakeEl;
  hero: FakeEl;
  heroCta: FakeEl;
  setScroll(y: number): void;
}

/** The root and the canvas every layout starts from, and `add` for placing elements that `place` then moves as scrolling would. */
function scene(width: number, pageHeight: number) {
  const items: Array<{ el: FakeEl; x: number; top: number; w: number; h: number; pinned: boolean }> = [];
  const add = (parent: FakeEl, attrs: Record<string, string>, x: number, top: number, w: number, h: number, pinned = false) => {
    const el = new FakeEl("div", attrs);
    items.push({ el, x, top, w, h, pinned });
    parent.append(el);
    return el;
  };
  const root = new FakeEl("main", { "data-landing": "root" });
  root.offsetWidth = width;
  root.offsetHeight = pageHeight;
  env.body.append(root);
  const canvas = new FakeEl("canvas");
  canvas.clientHeight = VIEWPORT;
  canvas.box = { left: 0, top: 0, width, height: VIEWPORT };
  root.append(canvas);
  const place = (y: number, topOf: (item: (typeof items)[number]) => number) => {
    env.window.scrollY = y;
    env.document.dispatch("scroll", {}); // wakes a loop that has rested
    root.box = { left: 0, top: -y, width, height: pageHeight };
    for (const item of items) item.el.box = { left: item.x, top: topOf(item), width: item.w, height: item.h };
  };
  return { root, canvas, add, place };
}

/**
 * The landing page's elements at the places the real page puts them: the hero with Ren's stage and its buttons,
 * the demo pinned for 2400px, the Feed wall, and the close. `setScroll` moves them as scrolling would.
 */
function buildPage(width = 1200): Page {
  const { root, canvas, add, place } = scene(width, PAGE);

  const hero = add(root, { "data-landing": "hero" }, 0, 0, width, VIEWPORT);
  const ren = add(hero, { "data-landing": "ren" }, 300, 100, REN.width, REN.height);
  add(hero, { "data-landing": "ren-stage" }, 300, 100, REN.width, REN.height);
  const heroCta = add(hero, { "data-cta": "hero" }, 100, 600, 200, 50);
  add(hero, { "data-cta": "nav" }, 900, 20, 100, 40);
  add(hero, { "data-landing": "logo-x" }, 40, 20, 30, 30);

  const demo = add(root, { "data-landing": "demo" }, 0, DEMO.top, width, DEMO.height);
  const card = add(demo, { "data-landing": "demo-card" }, 400, 1050, 400, 300, true);
  add(demo, { "data-landing": "demo-viz" }, 800, 1050, 300, 300, true);
  add(card, { "data-landing": "demo-choice" }, 420, 1200, 360, 40, true);
  add(card, { "data-landing": "demo-choice" }, 420, 1250, 360, 40, true);
  add(card, { "data-landing": "demo-verdict" }, 420, 1320, 200, 40, true);
  const prompt = add(card, { "data-landing": "demo-prompt" }, 420, 1100, 360, 40, true);
  (prompt as FakeEl & { lines: unknown }).lines = [
    { left: 420, top: 1100, width: 360, height: 20 },
    { left: 420, top: 1120, width: 200, height: 20 },
  ];
  for (let day = 0; day <= Math.max(...REVIEW_STRIP.days); day++)
    add(card, { "data-landing": "demo-day" }, 440 + day * 20, 1400, 16, 16, true);
  const strip = add(card, { "data-landing": "demo-strip" }, 420, 1380, 340, 40, true);
  add(strip, {}, 420, 1380, 340, 40, true);

  const feed = add(root, { "data-landing": "feed" }, 0, 3300, width, 900);
  add(feed, { "data-landing": "feed-wall" }, 100, WALL_TOP, 1000, 700);

  const close = add(root, { "data-landing": "close" }, 0, CLOSE_TOP, width, 1000);
  add(close, { "data-cta": "close" }, 400, 5300, 200, 50);
  add(close, { "data-landing": "day-one" }, 500, 5500, 300, 40);

  const setScroll = (y: number) =>
    place(y, (item) => (item.pinned ? item.top + Math.min(Math.max(0, y - DEMO.top), DEMO.height - VIEWPORT) - y : item.top - y));
  setScroll(0);
  publishRen({ grid: renGrid(REN.width, REN.height), ...REN });
  return { root, canvas, ren, hero, heroCta, setScroll };
}

const PAGE_H = 800;

/** The phone layout: five pages of one screen (800px here), each with the elements the engine follows on it. */
function buildPhonePage(): Page & { card: FakeEl; setPage(index: number): void } {
  const width = 390;
  const { root, canvas, add, place } = scene(width, PAGE_H * 5);
  const hero = add(root, { "data-landing": "hero", "data-page": "hero" }, 0, 0, width, PAGE_H);
  const ren = add(hero, { "data-landing": "ren" }, 95, 250, 200, 200);
  add(hero, { "data-landing": "ren-stage" }, 95, 250, 200, 200);
  const heroCta = add(hero, { "data-cta": "hero" }, 16, 700, 358, 52);
  const demo = add(root, { "data-page": "demo" }, 0, PAGE_H, width, PAGE_H);
  const card = add(demo, { "data-landing": "demo-phone-card", "data-step": "0", "data-outcome": "right" }, 16, PAGE_H + 220, 358, 380);
  add(root, { "data-page": "cards" }, 0, PAGE_H * 2, width, PAGE_H);
  add(root, { "data-page": "how" }, 0, PAGE_H * 3, width, PAGE_H);
  const close = add(root, { "data-landing": "close", "data-page": "close" }, 0, PAGE_H * 4, width, PAGE_H);
  add(close, { "data-cta": "close" }, 16, PAGE_H * 4 + 600, 358, 52);
  add(close, { "data-landing": "day-one" }, 60, PAGE_H * 4 + 300, 270, 40);

  const setScroll = (y: number) => place(y, (item) => item.top - y);
  setScroll(0);
  publishRen({ grid: renGrid(REN.width, REN.height), ...REN });
  return { root, canvas, ren, hero, heroCta, setScroll, card, setPage: (index) => setScroll(index * PAGE_H) };
}

// Helpers the tests below share.
const roundAll = (list: Array<[number, number]>) => list.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).toSorted();

const shotOfArcs = () => {
  const page = buildPage();
  publishWordmark(makeMark(40));
  stop = startParticles(page.canvas as never);
  env.frame(16);
  env.frame(400);
  const taken = JSON.stringify(page.canvas.ctx.calls.filter((c) => c.name === "arc"));
  stop();
  stop = null;
  env.restore();
  env = installDom();
  return taken;
};

const finite = (list: Array<[number, number, number]>) => list.every((d) => d.every(Number.isFinite));

/** The most dots on the canvas in any frame over the next `seconds`. */
const busiest = (page: Page, seconds: number) => {
  let most = 0;
  for (let i = 0; i < seconds * 30; i++) {
    env.frame(33);
    most = Math.max(most, dots(page).length);
  }
  return most;
};

/** Whether every dot is on the outline of `target`, 10px out. */
const onButton = (page: Page, target: FakeEl = page.heroCta) =>
  dots(page).every(([x, y]) => {
    const { left, top, width, height } = target.box;
    const nearX = Math.abs(x - (left - 10)) < 0.6 || Math.abs(x - (left + width + 10)) < 0.6;
    const nearY = Math.abs(y - (top - 10)) < 0.6 || Math.abs(y - (top + height + 10)) < 0.6;
    const withinX = x > left - 10.6 && x < left + width + 10.6;
    const withinY = y > top - 10.6 && y < top + height + 10.6;
    return (nearX && withinY) || (nearY && withinX);
  });

/** Whether all of the close's visitors are drawn, and every one on the button's outline. */
const cameTo = (page: Page, target: FakeEl) => dots(page).length === 5 && onButton(page, target);

const closeCta = (page: Page): FakeEl => {
  const cta = page.root.querySelector('[data-cta="close"]');
  if (!cta) throw new Error("the page has no close button");
  return cta;
};

const sections = (page: Page) => ["hero", "demo", "feed", "close"].map((name) => page.root.querySelector(`[data-landing="${name}"]`)!);

/** Starts the overlay on a page and runs the load intro to its end. */
function launch(mark: WordmarkInfo, width = 1200, scroll = 0) {
  const page = buildPage(width);
  publishWordmark(mark);
  page.setScroll(scroll);
  stop = startParticles(page.canvas as never);
  env.frame(16);
  env.frame(2000);
  return page;
}

function launchPhone(mark: WordmarkInfo) {
  const page = buildPhonePage();
  publishWordmark(mark);
  stop = startParticles(page.canvas as never);
  env.frame(16);
  env.frame(2000);
  return page;
}

const dots = (page: Page) => page.canvas.ctx.lastFrameDots();
/** The scroll position where the story is 2.99: the particles are almost in the wordmark, and have not been handed over. */
const NEARLY_THERE =
  storyAnchors({
    demoTop: DEMO.top,
    demoHeight: DEMO.height,
    wallTop: WALL_TOP,
    closeTop: CLOSE_TOP,
    wordmarkHeight: 32 + FONT_SIZE * 0.82,
    pageHeight: PAGE,
    viewport: VIEWPORT,
  }).closeEnd - 5;

describe("the intro", () => {
  it("brings Ren in as one particle for every lit cell of its face, with Ren hidden under them", () => {
    const page = buildPage();
    publishWordmark(makeMark(40));
    stop = startParticles(page.canvas as never);
    env.frame(16);
    expect(dots(page)).toHaveLength(renSources(renGrid(REN.width, REN.height), REN.width, REN.height).length);
    expect(page.ren.style.opacity).toBe("0");
    expect(page.ren.style.transition).toBe("none");
  });

  it("lands every particle on its own cell of Ren, and fades Ren in", () => {
    const page = launch(makeMark(40));
    const cells = renSources(renGrid(REN.width, REN.height), REN.width, REN.height);
    // Ren's stage sits at (300, 100) on the page.
    expect(roundAll(dots(page).map(([x, y]) => [x, y]))).toEqual(roundAll(cells.map((c) => [300 + c.x, 100 + c.y])));
    expect(page.ren.style.opacity).toBe("1");
  });

  it("starts the particles in the same places every run (seeded)", () => {
    const first = shotOfArcs();
    expect(first.length).toBeGreaterThan(1000);
    expect(shotOfArcs()).toBe(first);
  });

  it("does nothing until both Ren and the wordmark have published where they are", () => {
    const page = buildPage();
    stop = startParticles(page.canvas as never);
    env.frames(5, 100);
    expect(page.canvas.ctx.calls.filter((c) => c.name === "arc")).toHaveLength(0);
    publishWordmark(makeMark(40)); // the overlay starts over when either changes
    env.frame(16);
    expect(dots(page).length).toBeGreaterThan(0);
  });
});

describe("one particle for every letter dot", () => {
  it("a wide screen gets every one", () => {
    const page = launch(makeMark(300), 1200, NEARLY_THERE);
    env.frame(16);
    expect(dots(page)).toHaveLength(300);
    expect(stage.lettersHidden).toBe(true);
  });

  it("a phone's wordmark has a third of the dots, so it gets a third of the particles", () => {
    const keep = thin(300, PHONE_PARTICLE_SHARE);
    // On the phone's cards page, where every particle is out along the wall's edges.
    const page = launchPhone(makeMark(300, (n) => keep[n] ?? false));
    page.setPage(2);
    env.frames(150, 33);
    // 100 particles; one that is just fading in at the end of its line may have no radius yet.
    expect(dots(page).length).toBeGreaterThanOrEqual(95);
    expect(dots(page).length).toBeLessThanOrEqual(100);
  });

  it("starts over, with the new count, when the wordmark is drawn again", () => {
    const page = launch(makeMark(300), 1200, NEARLY_THERE);
    env.frame(16);
    expect(dots(page)).toHaveLength(300);
    publishWordmark(makeMark(120));
    env.frame(16);
    expect(dots(page)).toHaveLength(120);
  });

  it("puts each particle on its dot of the wordmark at the end, in the close section's own pixels", () => {
    const page = launch(makeMark(300), 1200, NEARLY_THERE);
    env.frames(30, 33);
    const mark = stage.mark!;
    const closeTop = CLOSE_TOP - NEARLY_THERE;
    const wanted = mark.dots
      .filter((d) => d.type)
      .map((d) => `${Math.round(d.x)},${Math.round(closeTop + d.y)}`)
      .toSorted();
    const drawn = dots(page)
      .map(([x, y]) => `${Math.round(x)},${Math.round(y)}`)
      .toSorted();
    expect(drawn).toEqual(wanted);
  });
});

// Whole-page walks of 400 particles over many frames: seconds of CPU each, so a loaded machine needs more than the 5s default.
describe("the journey", { timeout: 30_000 }, () => {
  it("follows the page: Ren, then the demo, then the wall, then the wordmark, with no bad numbers on the way", () => {
    const page = launch(makeMark(400));
    const colorsAt: Record<number, Set<string>> = {};
    const handedOver: boolean[] = [];
    for (const y of [0, 450, 900, 1200, 1700, 2100, 2500, 2800, 3100, 3500, 4000, 4400, 4800, 5100]) {
      page.setScroll(y);
      env.frames(60, 33);
      expect(finite(dots(page))).toBe(true);
      expect(dots(page).length).toBeLessThanOrEqual(400 + 6);
      colorsAt[y] = page.canvas.ctx.lastFrameColors();
      handedOver.push(!stage.lettersHidden);
    }
    // Ren is on its own canvas at the top, and gives way to the particles as the story starts.
    expect(page.ren.style.opacity).toBe("0");
    // The wordmark's canvas takes over only once the story has reached 3 (at 4498px here).
    expect(handedOver).toEqual([...Array(12).fill(false), true, true]);
    // The score lights green once the answer is marked, and the booked days light cyan.
    expect(colorsAt[1700]!.has(OK)).toBe(true);
    expect(colorsAt[2100]!.has(CYAN)).toBe(true);
  });

  it("brings Ren back when the page is scrolled back to the top", () => {
    const page = launch(makeMark(400));
    page.setScroll(1200);
    env.frames(60, 33);
    expect(page.ren.style.opacity).toBe("0");
    page.setScroll(0);
    env.frames(120, 33);
    expect(page.ren.style.opacity).toBe("1");
    expect(stage.lettersHidden).toBe(true);
  });

  it("takes the particles back out of the wordmark when the page is scrolled up from the end", () => {
    const page = launch(makeMark(400), 1200, 5100);
    env.frames(60, 33);
    expect(stage.lettersHidden).toBe(false);
    page.setScroll(3500);
    env.frames(60, 33);
    expect(stage.lettersHidden).toBe(true);
    expect(dots(page).length).toBeGreaterThan(100);
  });

  it("works at a phone's width on the long page", () => {
    const keep = thin(400, PHONE_PARTICLE_SHARE);
    const page = launch(
      makeMark(400, (n) => keep[n] ?? false),
      500,
    );
    for (const y of [0, 1200, 1700, 2100, 3100, 3500, 4400, 5100]) {
      page.setScroll(y);
      env.frames(60, 33);
      expect(finite(dots(page))).toBe(true);
    }
  });

  it("works with the demo and the wall missing from the page", () => {
    const page = buildPage();
    page.root.children = page.root.children.filter((el) => el.attrs["data-landing"] !== "demo" && el.attrs["data-landing"] !== "feed");
    publishWordmark(makeMark(400));
    stop = startParticles(page.canvas as never);
    env.frame(16);
    env.frame(2000);
    for (const y of [0, 300, 2000, 4000, 5100]) {
      page.setScroll(y);
      env.frames(40, 33);
      expect(finite(dots(page))).toBe(true);
    }
  });
});

// Whole-journey simulations: seconds of CPU each, so a loaded machine needs more than the 5s default.
describe("the visiting dots", { timeout: 30_000 }, () => {
  it("none visit the hero: once the intro is over nothing is drawn while the hero is in view, wide or phone", () => {
    expect(busiest(launch(makeMark(40)), 60)).toBe(0);
    stop?.();
    env.restore();
    env = installDom();
    expect(busiest(launch(makeMark(40), 500), 60)).toBe(0);
  });

  it("five visit the close's buttons once the wordmark is built, none on a phone", () => {
    const wide = busiest(launch(makeMark(40), 1200, 5100), 80);
    expect(wide).toBeGreaterThan(0);
    expect(wide).toBeLessThanOrEqual(5);
    stop?.();
    env.restore();
    env = installDom();
    const phone = busiest(launch(makeMark(40), 500, 5100), 80);
    expect(phone).toBe(0);
  });

  it("all come to the close button when a real mouse is over it", () => {
    const page = launch(makeMark(40), 1200, 5100);
    const cta = closeCta(page);
    env.frames(150, 33);
    expect(cameTo(page, cta)).toBe(false);
    env.document.dispatch("pointerover", pointer(cta));
    env.frames(150, 33);
    expect(dots(page)).toHaveLength(5);
    expect(onButton(page, cta)).toBe(true);
  });

  it("do not come for a finger", () => {
    const page = launch(makeMark(40), 1200, 5100);
    const cta = closeCta(page);
    env.document.dispatch("pointerover", pointer(cta, { pointerType: "touch" }));
    env.frames(150, 33);
    expect(cameTo(page, cta)).toBe(false);
  });

  it("go back to their rounds when the mouse leaves", () => {
    const page = launch(makeMark(40), 1200, 5100);
    const cta = closeCta(page);
    env.document.dispatch("pointerover", pointer(cta));
    env.frames(150, 33);
    env.document.dispatch("pointerout", pointer(cta));
    env.frames(150, 33);
    expect(cameTo(page, cta)).toBe(false);
  });

  it("the hero's button draws no one to it", () => {
    const page = launch(makeMark(40));
    env.document.dispatch("pointerover", pointer(page.heroCta));
    env.frames(150, 33);
    expect(dots(page)).toHaveLength(0);
  });
});

describe("on a phone the story follows the page", { timeout: 30_000 }, () => {
  const keep = thin(300, PHONE_PARTICLE_SHARE);
  const mark = () => makeMark(300, (n) => keep[n] ?? false);

  it("draws nothing on the hero page, once Ren is in", () => {
    const page = launchPhone(mark());
    expect(busiest(page, 30)).toBe(0);
    expect(page.ren.style.opacity).toBe("1");
  });

  it("runs a ribbon round the demo card on page two, in the card's own colours", () => {
    const page = launchPhone(mark());
    page.setPage(1);
    env.frames(120, 33);
    const lit = dots(page);
    expect(lit.length).toBeGreaterThan(30);
    expect(lit.length).toBeLessThanOrEqual(100); // a third of 300
    const { left, top, width, height } = page.card.box;
    // Every dot is on the ribbon round the card or a wobbling visitor near it: within 60px of the card.
    expect(lit.every(([x, y]) => x > left - 60 && x < left + width + 60 && y > top - 60 && y < top + height + 60)).toBe(true);
    expect(page.canvas.ctx.lastFrameColors().has(CYAN)).toBe(true);
    page.card.dataset.step = "1";
    env.frames(120, 33);
    expect(page.canvas.ctx.lastFrameColors().has(OK)).toBe(true);
    page.card.dataset.outcome = "wrong";
    env.frames(120, 33);
    expect(page.canvas.ctx.lastFrameColors().has("#F87171")).toBe(true);
  });

  it("flows down the two edges of the page on pages three and four, with no verdict pills", () => {
    const page = launchPhone(mark());
    for (const index of [2, 3]) {
      page.setPage(index);
      env.frames(150, 33);
      const lit = dots(page);
      expect(lit.length).toBeGreaterThan(30);
      expect(lit.length).toBeLessThanOrEqual(100);
      const edges = [7, 390 - 7];
      expect(lit.every(([x]) => edges.some((edge) => Math.abs(x - edge) < 6))).toBe(true);
    }
  });

  it("settles into the wordmark on the last page and hands the letters over", () => {
    const page = launchPhone(mark());
    page.setPage(4);
    env.frames(200, 33);
    expect(stage.lettersHidden).toBe(false);
    expect(dots(page)).toHaveLength(0); // the wordmark's canvas draws the letters, and a phone has no visiting dots
  });

  it("goes back up: the page-by-page story runs in reverse", () => {
    const page = launchPhone(mark());
    page.setPage(4);
    env.frames(200, 33);
    page.setPage(1);
    env.frames(200, 33);
    expect(stage.lettersHidden).toBe(true);
    expect(dots(page).length).toBeGreaterThan(30);
    page.setPage(0);
    env.frames(200, 33);
    expect(dots(page)).toHaveLength(0);
    expect(page.ren.style.opacity).toBe("1");
  });

  it("is a third of the desktop's count of particles, for the same wordmark", () => {
    const wide = launch(makeMark(300), 1200, NEARLY_THERE);
    env.frame(16);
    const wideCount = dots(wide).length;
    stop?.();
    env.restore();
    env = installDom();
    const page = launchPhone(mark());
    page.setPage(2);
    env.frames(150, 33);
    expect(dots(page).length).toBeLessThanOrEqual(wideCount / 3 + 1);
  });
});

describe("running only when it is needed", () => {
  it("stops asking for frames when no section it acts on is on screen, and starts again when one is", () => {
    const page = launch(makeMark(40));
    for (const section of sections(page)) env.intersect(section, false);
    env.frame(16);
    expect(env.pending()).toBe(0);
    const calls = page.canvas.ctx.calls.length;
    env.frames(5, 33);
    expect(page.canvas.ctx.calls).toHaveLength(calls);
    env.intersect(sections(page)[2]!, true);
    expect(env.pending()).toBe(1);
    env.frame(16);
    expect(page.canvas.ctx.calls.length).toBeGreaterThan(calls);
  });

  it("on a phone, runs while any page is on screen and stops when none is", () => {
    const page = launchPhone(makeMark(40));
    const pages = page.root.querySelectorAll("[data-page]");
    for (const p of pages) env.intersect(p, false);
    env.frame(16);
    expect(env.pending()).toBe(0);
    const third = pages[2];
    if (!third) throw new Error("the phone page has no third page");
    env.intersect(third, true);
    expect(env.pending()).toBe(1);
  });

  it("rests while nothing moves, on the hero and on a settled phone close, and wakes when the page scrolls", () => {
    const page = launchPhone(makeMark(40));
    env.frames(3, 33);
    expect(env.pending()).toBe(0); // the hero page: nothing is drawn
    page.setScroll(PAGE_H * 4); // the close: the particles fly in, then the wordmark takes over
    env.frames(200, 33);
    expect(stage.lettersHidden).toBe(false);
    expect(env.pending()).toBe(0);
    const calls = page.canvas.ctx.calls.length;
    env.frames(5, 33);
    expect(page.canvas.ctx.calls).toHaveLength(calls);
    page.setScroll(PAGE_H);
    expect(env.pending()).toBe(1);
  });

  it("keeps going through the intro whatever is on screen", () => {
    const page = buildPage();
    publishWordmark(makeMark(40));
    stop = startParticles(page.canvas as never);
    for (const section of sections(page)) env.intersect(section, false);
    env.frame(16);
    expect(env.pending()).toBe(1);
  });

  it("measures again, after a pause, when the page is resized", () => {
    const page = launch(makeMark(300), 1200, NEARLY_THERE);
    env.frame(16);
    expect(page.canvas.width).toBe(1200);
    page.root.offsetWidth = 900;
    env.resize(page.root);
    env.resize(page.root); // a burst of resizes is one
    env.timers(119);
    expect(page.canvas.width).toBe(1200);
    env.timers(1);
    expect(page.canvas.width).toBe(900);
    env.frame(16);
    expect(dots(page)).toHaveLength(300);
  });

  it("sizes its canvas for a dense screen, up to twice the pixels", () => {
    env.window.devicePixelRatio = 3;
    const page = launch(makeMark(40));
    expect(page.canvas.width).toBe(2400);
    expect(page.canvas.height).toBe(VIEWPORT * 2);
    expect(page.canvas.ctx.calls.find((c) => c.name === "setTransform")?.args).toEqual([2, 0, 0, 2, 0, 0]);
  });
});

describe("destroy", () => {
  it("does not listen to the pointer on a touch screen", () => {
    env.window.media["(hover: none)"] = true;
    const page = launch(makeMark(40));
    expect(page.hero.listenerCount("pointermove")).toBe(0);
  });

  it("lets go of the page: listeners, observers, the frame in flight, and Ren's opacity", () => {
    const page = launch(makeMark(40));
    expect(page.hero.listenerCount("pointermove")).toBe(1);
    expect(env.document.listenerCount("pointerover")).toBe(1);
    expect(env.document.listenerCount("pointerout")).toBe(1);
    expect(stage.overlay).toBe(true);
    env.frames(5, 33);
    stop!();
    stop = null;
    expect(page.hero.listenerCount("pointermove")).toBe(0);
    expect(env.document.listenerCount("pointerover")).toBe(0);
    expect(env.document.listenerCount("pointerout")).toBe(0);
    expect(env.liveObservers()).toBe(0);
    expect(env.pending()).toBe(0);
    expect(stage.overlay).toBe(false);
    expect(stage.lettersHidden).toBe(false);
    expect(page.ren.style.opacity).toBe("");
    expect(page.ren.style.transition).toBe("");
  });

  it("no longer reacts to Ren or the wordmark changing", () => {
    const page = launch(makeMark(40));
    stop!();
    stop = null;
    const calls = page.canvas.ctx.calls.length;
    publishWordmark(makeMark(60));
    env.frames(5, 33);
    expect(page.canvas.ctx.calls).toHaveLength(calls);
  });

  it("stops the pause before a resize from running", () => {
    const page = launch(makeMark(40));
    env.resize(page.root);
    stop!();
    stop = null;
    page.root.offsetWidth = 700;
    env.timers(500);
    expect(page.canvas.width).toBe(1200);
  });

  it("stops when the page itself has gone", () => {
    const page = launch(makeMark(40));
    env.frames(3, 33);
    const calls = page.canvas.ctx.calls.length;
    page.root.isConnected = false;
    env.frames(3, 33);
    expect(page.canvas.ctx.calls).toHaveLength(calls);
  });
});
