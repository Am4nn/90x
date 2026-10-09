import { saveAudioProgress } from "@/app/actions/audio";

// Page-hide saves arrive as a beacon (a fetch started during pagehide is dropped). Same write, same
// viewer check, through the server action. Anything malformed is ignored: progress is a convenience.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { topicSlug?: unknown; positionS?: unknown; rate?: unknown; finished?: unknown };
    if (typeof body.topicSlug === "string" && typeof body.positionS === "number") {
      await saveAudioProgress({
        topicSlug: body.topicSlug,
        positionS: body.positionS,
        rate: typeof body.rate === "number" ? body.rate : 1,
        finished: body.finished === true,
      });
    }
  } catch {
    // ignored
  }
  return new Response(null, { status: 204 });
}
