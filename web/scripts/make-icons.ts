// App icons for the manifest and the iOS Home Screen: "90x" in Sora bold on
// the app background, x in the accent colour (the Logo in components/brand).
// Output is committed in public/icons/. Usage: bun run scripts/make-icons.ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

// Tokens from globals.css: --x-bg, --x-text, --x-accent.
const BG = "#0a0c10";
const TEXT = "#e6e9ef";
const ACCENT = "#67e8f9";

// To a non-browser user agent Google answers with TrueType, which the SVG
// renderer can load (it can't read the app's woff2). `text=90x` subsets it to three glyphs.
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Sora:wght@700&text=90x";
const PLAIN_UA = "90x-make-icons";

/** width: how much of the icon the mark spans. Maskable icons keep it inside the central 80% safe circle. */
const ICONS = [
  { file: "icon-192.png", size: 192, width: 0.72 },
  { file: "icon-512.png", size: 512, width: 0.72 },
  { file: "icon-maskable-512.png", size: 512, width: 0.56 },
  { file: "apple-touch-icon.png", size: 180, width: 0.66 },
];

async function soraTtf(dir: string): Promise<string> {
  const css = await fetch(FONT_CSS, { headers: { "User-Agent": PLAIN_UA } }).then((r) => r.text());
  const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)\s*format\('truetype'\)/.exec(css)?.[1];
  if (!url) throw new Error("Sora: no TrueType file in Google's CSS");
  const file = path.join(dir, "sora-700.ttf");
  await writeFile(file, new Uint8Array(await (await fetch(url)).arrayBuffer()));
  return file;
}

/** The mark alone on transparent, rendered large and trimmed to its ink so it can be centred exactly. */
async function mark(fontFile: string): Promise<Buffer> {
  // Rendering text from a font file registers it with fontconfig for this
  // process, so the SVG below finds "Sora" by name.
  await sharp({ text: { text: "90x", font: "Sora Bold", fontfile: fontFile } })
    .png()
    .toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="600">
  <text x="700" y="420" text-anchor="middle" font-family="Sora" font-weight="700" font-size="400" letter-spacing="-10" fill="${TEXT}">90<tspan fill="${ACCENT}">x</tspan></text>
</svg>`;
  return sharp(Buffer.from(svg)).trim().png().toBuffer();
}

const tmp = await mkdtemp(path.join(tmpdir(), "90x-icons-"));
try {
  const glyphs = await mark(await soraTtf(tmp));
  const out = path.join(process.cwd(), "public", "icons");
  await mkdir(out, { recursive: true });
  for (const icon of ICONS) {
    const inner = await sharp(glyphs)
      .resize({ width: Math.round(icon.size * icon.width) })
      .toBuffer();
    // Opaque square: iOS rounds the corners itself, and maskable icons are cropped by the launcher.
    await sharp({ create: { width: icon.size, height: icon.size, channels: 4, background: BG } })
      .composite([{ input: inner, gravity: "centre" }])
      .flatten({ background: BG })
      .png({ compressionLevel: 9 })
      .toFile(path.join(out, icon.file));
    console.log(`${icon.file}  ${icon.size}px`);
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}
