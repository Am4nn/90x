// Is the app still spending its own design tokens? (after Curfew's check-tokens)
//
// The design fixes six text sizes (display, title, heading, body, small, tag),
// Sora + Manrope, and colours that come only from tokens. Nothing stops
// `text-[11.5px]` or `text-gray-400` except this.
//
// BANNED: a property with a complete token set, so any escape fails.
// RATCHETED: spacing and sizing one-offs, which are sometimes real layout.
// The count may fall and may never rise.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Spacing and sizing escapes that remain. Lower it, never raise it.
 *
 * Tightening this IS the maintenance. A ratchet only works if somebody turns
 * it, and the script says so out loud when the count drops.
 */
const CEILING = 4;

const SPACING = "p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y";
const SIZING = "w|h|size|min-w|min-h|max-w|max-h|top|bottom|left|right|inset|basis";

interface Rule {
  what: string;
  pattern: RegExp;
  instead: string;
}

/** No escape is allowed. The token set for these is complete. */
const BANNED: Rule[] = [
  {
    what: "font size",
    pattern: /\btext-\[[0-9.]+(?:px|rem|em)\]/g,
    instead: "text-micro|2xs|xs|sm|base|lg|xl|2xl|3xl|4xl",
  },
  {
    what: "line height",
    pattern: /\bleading-\[[^\]]+\]/g,
    instead: "leading-tight|snug|normal|relaxed|loose",
  },
  {
    what: "letter spacing",
    pattern: /\btracking-\[[^\]]+\]/g,
    instead: "tracking-tight|normal|wide|wider|caps|label|widest",
  },
  {
    what: "colour",
    // A hex anywhere in a class, and the named Tailwind palette, which this
    // app does not use: its colours are semantic tokens over CSS variables.
    pattern:
      /\[#[0-9a-fA-F]{3,8}\]|\b(?:text|bg|border|from|via|to|fill|stroke|ring|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
    instead: "a token: text-text-2, text-mute, border-line, bg-surface, text-cyan, bg-topic-dsa, text-ok",
  },
  {
    what: "font family",
    pattern: /\bfont-\[[^\]]+\]/g,
    instead: "font-display (Sora) or the default Manrope",
  },
];

/** Allowed, counted, and the count may only fall. */
const RATCHETED: Rule[] = [
  {
    what: "spacing",
    pattern: new RegExp(`\\b(?:${SPACING})-\\[[0-9.]+(?:px|rem)\\]`, "g"),
    instead: "a Tailwind key: gap-2.5 is 10px, p-3 is 12px, py-5 is 20px",
  },
  {
    what: "sizing",
    pattern: new RegExp(`\\b(?:${SIZING})-\\[[^\\]]+\\]`, "g"),
    instead: "a Tailwind key where one fits",
  },
  {
    what: "inline style",
    // A hardcoded px, rem or hex inside style={{ ... }}. Gradients and a
    // handful of computed values are real; a colour or a padding is not.
    pattern: /style=\{\{[^}]*?(?:[0-9.]+(?:px|rem)|#[0-9a-fA-F]{3,8})[^}]*?\}\}/g,
    instead: "a class, so the token applies and both themes follow it",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const banned = new Map<string, { file: string; text: string }[]>();
const counts = new Map<string, number>();
const worst = new Map<string, number>();
let ratcheted = 0;

// shadcn primitives keep their upstream classes; they're restyled through tokens.
// global-error renders without the theme, so it can only use inline styles.
const EXEMPT = /[\\/](components[\\/]ui[\\/]|app[\\/]global-error\.tsx$)/;
for (const file of walk("src").filter((f) => !EXEMPT.test(f))) {
  const text = readFileSync(file, "utf8");
  if (!text.includes("className") && !text.includes("style=")) continue;
  const where = file.replace(/\\/g, "/");

  for (const { what, pattern } of BANNED) {
    for (const m of text.matchAll(pattern)) {
      banned.set(what, [...(banned.get(what) ?? []), { file: where, text: m[0] }]);
    }
  }

  let here = 0;
  for (const { what, pattern } of RATCHETED) {
    const n = [...text.matchAll(pattern)].length;
    if (n === 0) continue;
    counts.set(what, (counts.get(what) ?? 0) + n);
    here += n;
  }
  if (here > 0) worst.set(where, here);
  ratcheted += here;
}

let failed = 0;

console.log("  BANNED, because the tokens are complete");
for (const { what, instead } of BANNED) {
  const hits = banned.get(what) ?? [];
  if (hits.length === 0) {
    console.log(`    ok    ${what}`);
    continue;
  }
  failed += 1;
  console.log(`    FAIL  ${what}: ${hits.length}`);
  console.log(`          use ${instead}`);
  for (const h of hits.slice(0, 5)) {
    console.log(`            ${h.file}  ${h.text.slice(0, 48)}`);
  }
  if (hits.length > 5) console.log(`            and ${hits.length - 5} more`);
}

console.log("\n  RATCHETED, because a one-off is sometimes real");
for (const { what } of RATCHETED) {
  console.log(`    ${String(counts.get(what) ?? 0).padStart(4)}  ${what}`);
}
console.log(`    ${String(ratcheted).padStart(4)}  total, ceiling ${CEILING}`);

if (ratcheted > CEILING) {
  failed += 1;
  console.log(`\n    FAIL  ${ratcheted - CEILING} more than the ceiling.`);
  console.log("          worst files:");
  for (const [file, n] of [...worst].toSorted((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`            ${String(n).padStart(3)}  ${file}`);
  }
} else if (ratcheted < CEILING) {
  failed += 1;
  console.log(`\n    FAIL  ${CEILING - ratcheted} below the ceiling, which is good news.`);
  console.log(`          Lower CEILING to ${ratcheted} so it cannot creep back.`);
  console.log("          A ratchet only works if somebody turns it.");
}

if (failed > 0) process.exit(1);
console.log("\nok: the app is still spending its own tokens.");
