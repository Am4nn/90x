import { z } from "zod";
import { gate } from "@/lib/auth/gate";
import { getViewer } from "@/lib/auth/viewer";
import { requestStop } from "@/lib/coach/stop";
import { threadOwner } from "@/lib/coach/threads";
import { logError } from "@/lib/log";

// The Stop button. A reply no longer stops when the connection drops - closing
// the app leaves it to finish - so an explicit stop has to say so itself.
//
// 204 only when the stop was actually recorded. Answering 204 regardless was a
// lie the reader would act on: they press Stop, see it accepted, and the answer
// arrives and is saved anyway with nothing having said it might.

const Body = z.object({ threadId: z.uuid() });

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer || gate({ userId: viewer.id, approval: viewer.approval, setupDone: viewer.setupDone })) {
    return new Response(null, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });

  // Somebody else's thread is a 404, like every other query. A thread that does
  // not exist yet is accepted: the client chooses the id before sending its first
  // message, so a Stop pressed during that request arrives before the row does -
  // and refusing it there was the one moment a stop could be lost entirely. The
  // flag is keyed by user, so the worst a caller can do with an invented id is
  // stop an answer of their own.
  const owner = await threadOwner(parsed.data.threadId);
  if (owner !== null && owner !== viewer.id) return new Response(null, { status: 404 });

  try {
    await requestStop(viewer.id, parsed.data.threadId);
  } catch (e) {
    logError("coach stop not recorded", e);
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 204 });
}
