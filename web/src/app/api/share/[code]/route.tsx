import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { after } from "next/server";
import { ShareCard } from "@/components/share/share-card";
import { isShareCode } from "@/lib/share/code";
import { VERSION } from "@/lib/share/link";
import { cardModelForCode, countCardView } from "@/lib/share/service";
import { siteUrl } from "@/lib/site-url";

// Public on purpose: the card is what a user shares. It draws only the CardModel (day number,
// totals, grid squares), so nothing private can reach it. The edge may keep a card for 15
// minutes. Only a single `v` query (see cardPath) is accepted, so a scraper cannot dodge the edge
// cache with random query strings; the sharer's own URL carries a progress version so they never
// see a card from before they finished the day.
//
// Views (admin Analytics): one UPDATE after a 200, run after the response is sent so it never slows or breaks
// the card. Only origin renders are counted: an edge-cached hit (up to 15 minutes) never reaches this code, so
// the number is a floor, not every view. The sharer's own versioned fetch (?v=, from the share row) is not a
// view and is left out. 404s and 503s are never counted.

const SIZE = { width: 1200, height: 630 };
const CARD_CACHE = "public, max-age=300, s-maxage=900, stale-while-revalidate=3600";
// Short, so a code made a minute from now works for someone who just tried it.
const MISS_CACHE = "public, max-age=60";

const font = (file: string) => readFile(path.join(process.cwd(), "assets", "fonts", file));
const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": MISS_CACHE } });

export async function GET(request: Request) {
  // The code comes from the raw path, so undecodable percent-encoding is a plain 404, never a throw.
  const url = new URL(request.url);
  const code = url.pathname.split("/").pop() ?? "";
  const keys = [...url.searchParams.keys()];
  const version = url.searchParams.get("v");
  // Malformed codes, extra query keys and malformed versions never reach the database.
  if (!isShareCode(code) || keys.length > 1 || (keys.length === 1 && (keys[0] !== "v" || !VERSION.test(version ?? "")))) return notFound();

  try {
    const model = await cardModelForCode(code);
    if (!model) return notFound();

    const [sora, manrope] = await Promise.all([font("sora-700.ttf"), font("manrope-500.ttf")]);
    // ImageResponse renders lazily; render here so a drawing error is a 503, not a cacheable broken 200.
    const png = await new ImageResponse(<ShareCard model={model} host={siteUrl().host} />, {
      ...SIZE,
      fonts: [
        { name: "Sora", data: sora, weight: 700, style: "normal" },
        { name: "Manrope", data: manrope, weight: 500, style: "normal" },
      ],
    }).arrayBuffer();
    if (version === null)
      after(() =>
        countCardView(code).catch((error: unknown) => {
          console.error("share card view not counted", error);
        }),
      );
    return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": CARD_CACHE } });
  } catch (error) {
    // A database or font failure answers a bare 503, never a stack, and is not cached.
    console.error("share card failed", error);
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
