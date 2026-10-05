// Put Sora, Manrope and JetBrains Mono in the repo (after Curfew's fetch-font): a
// build that downloads fonts from Google can fail for a reason nobody controls,
// and it did in CI. Latin only; all are variable fonts, so one file each covers
// every weight the app uses. JetBrains Mono (500 to 700) is for the landing page
// only: Ren's ASCII, the typed chat and the step numbers.
// Usage: bun run scripts/fetch-fonts.ts [family]   (a family name fetches only that one)
//
// Also static TrueType cuts for the link card and scripts/make-icons.ts:
// Satori and opentype.js can't read woff2 or variable fonts.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
// To a non-browser user agent Google answers with one static TrueType file per weight.
const PLAIN_UA = "90x-fetch-fonts";
const FAMILIES = [
  { name: "Sora", query: "Sora:wght@600..700", file: "sora-latin.woff2" },
  { name: "Manrope", query: "Manrope:wght@500..700", file: "manrope-latin.woff2" },
  { name: "JetBrains Mono", query: "JetBrains+Mono:wght@500..700", file: "jetbrains-mono-latin.woff2" },
];
// A family named on the command line is the only one fetched, so adding one does not rewrite the others' files.
const only = process.argv[2];
const TRUETYPE = [
  { name: "Sora", query: "Sora:wght@700", file: "sora-700.ttf" },
  { name: "Manrope", query: "Manrope:wght@500", file: "manrope-500.ttf" },
];

const css = (query: string, userAgent: string) =>
  fetch(`https://fonts.googleapis.com/css2?family=${query}&display=swap`, { headers: { "User-Agent": userAgent } }).then((r) => r.text());

async function save(dir: string, file: string, url: string) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  await writeFile(path.join(dir, file), bytes);
  console.log(`${file}  ${(bytes.length / 1024).toFixed(1)} KB`);
}

const out = path.join(process.cwd(), "src", "app", "fonts");
await mkdir(out, { recursive: true });
for (const f of FAMILIES.filter((family) => !only || family.name === only)) {
  const latin = (await css(f.query, UA)).split("/* ").find((b) => b.startsWith("latin */"));
  const url = latin && /(https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)/.exec(latin)?.[1];
  if (!url) throw new Error(`${f.name}: no latin woff2 in Google's CSS`);
  await save(out, f.file, url);
}

const assets = path.join(process.cwd(), "assets", "fonts");
await mkdir(assets, { recursive: true });
for (const f of only ? [] : TRUETYPE) {
  const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/.exec(await css(f.query, PLAIN_UA))?.[1];
  if (!url) throw new Error(`${f.name}: no TrueType file in Google's CSS`);
  await save(assets, f.file, url);
}
