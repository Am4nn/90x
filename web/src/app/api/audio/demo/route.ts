import { DEMO_AUDIO_SLUG } from "@/lib/audio/demo";
import { audioEnv } from "@/lib/audio/env";
import { audioFor } from "@/lib/audio/queries";
import { signAudioUrl } from "@/lib/audio/sign";
import { logError } from "@/lib/log";

// Public, no sign-in: a 12-hour signed URL for the demo lesson's file and nothing else, so the file
// still streams straight from the private R2 bucket (no egress fee, no app bandwidth). The CDN keeps
// the answer for an hour (plus an hour stale), so the server signs about once an hour however many
// people press play, and a cached URL always has 10 hours left. The proxy skips the session for this
// path, so no Set-Cookie can land on a cached answer.
export const dynamic = "force-dynamic";

const CACHED = "public, s-maxage=3600, stale-while-revalidate=3600";
// Until the demo lesson is published: re-asked within a minute, so it appears soon after.
const MISSING = "public, s-maxage=60";

export async function GET(): Promise<Response> {
  const env = audioEnv();
  if (!env) return missing();
  try {
    const audio = await audioFor(DEMO_AUDIO_SLUG);
    if (!audio) return missing();
    const url = await signAudioUrl(audio.r2Key, env);
    return Response.json(
      { slug: DEMO_AUDIO_SLUG, url, durationS: audio.durationS, lines: audio.lines },
      { headers: { "Cache-Control": CACHED } },
    );
  } catch (e) {
    // A database or signing failure: a plain 503, never cached, the details only in the server log.
    logError("demo audio unavailable", e);
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function missing(): Response {
  return Response.json({ error: "no-audio" }, { status: 404, headers: { "Cache-Control": MISSING } });
}
