import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards on source (the browser-side twin, which reads what is rendered, is e2e/landing-guard.spec.ts): the copy rules that are easy to break by typing a sentence in JSX,
// the consent line that must sit with every Google button, and the try page's promise of no network.

const SRC = path.join(process.cwd(), "src");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
const rel = (file: string) => path.relative(SRC, file).replaceAll(path.sep, "/");
const files = walk(SRC).map((file) => ({ file: rel(file), text: readFileSync(file, "utf8") }));
const notTest = ({ file }: { file: string }) => !/\.test\.tsx?$/.test(file);

/** Everything the landing page and /try show: their components, their copy and the two route files. */
const LANDING = files.filter(
  ({ file }) =>
    notTest({ file }) &&
    /^(components\/(landing|try)\/|lib\/landing\/|app\/(page|layout|opengraph-image|twitter-image|try\/page)\.tsx$)/.test(file),
);

describe("the landing page's copy rules", () => {
  it("has source to scan", () => {
    expect(LANDING.length).toBeGreaterThan(30);
  });

  it("never says the page grades what you type", () => {
    expect(LANDING.filter(({ text }) => /grad(?:es?|ed|ing)\s+what\s+you\s+type/i.test(text)).map((f) => f.file)).toEqual([]);
  });

  it("never calls a session short or quick: the length is what the user picks", () => {
    expect(LANDING.filter(({ text }) => /(?:short|quick)\s+session/i.test(text)).map((f) => f.file)).toEqual([]);
  });

  it("never promises 20 minutes a day, or any fixed daily time", () => {
    expect(LANDING.filter(({ text }) => /20\s+minutes|\d+\s?min(?:ute)?s?\s+a\s+day/i.test(text)).map((f) => f.file)).toEqual([]);
  });

  it("never says Eleven kinds, and has no testimonials, user counts, star ratings or exclamation marks in its words", () => {
    expect(LANDING.filter(({ text }) => /eleven\s+kinds/i.test(text)).map((f) => f.file)).toEqual([]);
    // Copy modules only: JSX and TypeScript use "!" for other things.
    const copy = LANDING.filter(({ file }) => /^lib\/landing\/(copy|how|proof|try-cards|seo)\.ts$/.test(file));
    expect(copy.length).toBe(5);
    expect(
      copy
        .filter(({ text }) => /testimonial|\b\d[\d,]*\s+(?:users|learners|people|members|engineers)\b|\bstars?\b/i.test(text))
        .map((f) => f.file),
    ).toEqual([]);
    expect(copy.filter(({ text }) => /[A-Za-z]!(?=["'` ])/.test(text.replace(/!==?/g, ""))).map((f) => f.file)).toEqual([]);
  });
});

describe("the consent line", () => {
  it("is rendered by every file that renders a Google button", () => {
    const offenders = files
      .filter(notTest)
      .filter(({ file }) => file.endsWith(".tsx") && file !== "components/landing/sign-in-buttons.tsx")
      .filter(({ text }) => /<GoogleCta\b/.test(text) && !/<ConsentNote\b/.test(text))
      .map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("is in the three places the design names: the hero, the close and the try bar", () => {
    for (const file of ["components/landing/hero.tsx", "components/landing/close-section.tsx", "components/try/try-bar.tsx"]) {
      expect(files.find((f) => f.file === file)?.text, file).toMatch(/<ConsentNote\b/);
    }
  });
});

describe("the try page promises no network but the demo audio route and its anonymous event beacon", () => {
  // Two exceptions: the demo player asks the public audio route for the lesson's file on the first press of
  // play, and the beacon posts anonymous events. lib/try/events.ts is the route's server side (it inserts), so
  // it is out of scope here and no try file may import it.
  const BEACON = "components/try/try-events.ts";
  const SERVER = "lib/try/events.ts";
  const DEMO_ROUTE = 'fetch("/api/audio/demo")';
  const tryFiles = files
    .filter(notTest)
    .filter(({ file }) => /^(components\/try\/|lib\/landing\/try-|lib\/try\/|app\/try\/)/.test(file) && file !== SERVER);

  it("imports no database, no Supabase, no server action and calls no fetch but the demo audio route and the beacon", () => {
    expect(tryFiles.length).toBeGreaterThanOrEqual(8);
    expect(
      tryFiles
        .filter(({ file, text }) =>
          file === BEACON
            ? /@\/db|@\/lib\/supabase|@\/lib\/try\/events|"use server"|server-only|axios|XMLHttpRequest/.test(text)
            : /fetch\(|sendBeacon|@\/db|@\/lib\/supabase|@\/lib\/try\/events|"use server"|server-only|axios|XMLHttpRequest/.test(
                text.replaceAll(DEMO_ROUTE, ""),
              ),
        )
        .map((f) => f.file),
    ).toEqual([]);
  });

  it("lets the beacon reach the event route and nothing else", () => {
    const beacon = tryFiles.find(({ file }) => file === BEACON)?.text ?? "";
    expect(beacon).toMatch(/sendBeacon/);
    expect(beacon.match(/["'`]\/api\/[^"'`]*["'`]/g)).toEqual(['"/api/try/event"']);
    expect(beacon).not.toMatch(/https?:\/\//);
  });
});
