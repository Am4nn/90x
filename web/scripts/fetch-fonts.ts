// Put Sora and Manrope in the repo (after Curfew's fetch-font): a build that
// downloads fonts from Google can fail for a reason nobody controls, and it
// did in CI. Latin only; both are variable fonts, so one file each covers
// every weight the app uses. Usage: bun run scripts/fetch-fonts.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const FAMILIES = [
  { name: "Sora", query: "Sora:wght@600..700", file: "sora-latin.woff2" },
  { name: "Manrope", query: "Manrope:wght@500..700", file: "manrope-latin.woff2" },
];

const out = path.join(process.cwd(), "src", "app", "fonts");
await mkdir(out, { recursive: true });

for (const f of FAMILIES) {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${f.query}&display=swap`, { headers: { "User-Agent": UA } }).then((r) =>
    r.text(),
  );
  const latin = css.split("/* ").find((b) => b.startsWith("latin */"));
  const url = latin && /(https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)/.exec(latin)?.[1];
  if (!url) throw new Error(`${f.name}: no latin woff2 in Google's CSS`);
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  await writeFile(path.join(out, f.file), bytes);
  console.log(`${f.file}  ${(bytes.length / 1024).toFixed(1)} KB`);
}
