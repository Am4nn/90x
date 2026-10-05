import { getViewer } from "@/lib/auth/viewer";
import { saveSubscription } from "@/lib/push";

/**
 * The service worker calls this when the browser rotates a push subscription
 * (`pushsubscriptionchange`): no page is open then, so it can't use a server action.
 * It rides on the session cookie, so it only ever saves a subscription for the signed-in person.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.approval !== "approved") return Response.json({ error: "not signed in" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  return (await saveSubscription(viewer.id, body))
    ? Response.json({ ok: true })
    : Response.json({ error: "bad subscription" }, { status: 400 });
}
