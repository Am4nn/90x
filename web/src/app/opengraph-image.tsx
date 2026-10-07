import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { BRAND_COLORS, MARK_BOX, MARK_STROKE } from "@/lib/brand/mark";
import { MARK } from "@/lib/brand/mark-geometry";
import { OG_ALT, OG_LINES } from "@/lib/landing/seo";

// The card a pasted 90x link shows (brand mock): the mark, then the headline.
// Static and the same for every page: it never shows anyone's data. Satori
// takes inline styles only, so sizes are numbers here rather than classes.

export const alt = OG_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MARK_SIZE = 320;
// The longer line, "Backend interview prep", has to fit the column beside the mark on one line (64 wrapped it).
const HEADLINE_SIZE = 50;

// Satori reads TrueType, not woff2 (scripts/fetch-fonts.ts).
const font = (file: string) => readFile(path.join(process.cwd(), "assets", "fonts", file));

export default async function Image() {
  const [sora, manrope] = await Promise.all([font("sora-700.ttf"), font("manrope-500.ttf")]);
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 72,
        width: "100%",
        height: "100%",
        paddingLeft: 84,
        paddingRight: 84,
        background: BRAND_COLORS.bg,
      }}
    >
      <svg width={MARK_SIZE} height={MARK_SIZE} viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`}>
        <path d={MARK.ninety} fill={BRAND_COLORS.text} />
        {MARK.strokes.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={BRAND_COLORS.accent}
            strokeWidth={MARK_STROKE}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
        <div
          style={{
            fontFamily: "Sora",
            fontSize: HEADLINE_SIZE,
            lineHeight: 1.1,
            color: BRAND_COLORS.text,
          }}
        >
          {OG_LINES[0]}
        </div>
        <div
          style={{
            fontFamily: "Sora",
            fontSize: HEADLINE_SIZE,
            lineHeight: 1.1,
            color: BRAND_COLORS.accent,
          }}
        >
          {OG_LINES[1]}
        </div>
        <div style={{ fontFamily: "Manrope", fontSize: 34, color: BRAND_COLORS.text2 }}>90x.amanarya.com</div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Sora", data: sora, weight: 700, style: "normal" },
        { name: "Manrope", data: manrope, weight: 500, style: "normal" },
      ],
    },
  );
}
