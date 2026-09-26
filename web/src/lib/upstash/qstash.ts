import "server-only";
import { Receiver } from "@upstash/qstash";

/** Verifies a QStash request, including that it was signed for this exact URL,
 *  so a job meant for Curfew (same QStash account) can't trigger 90x. */
export async function verifyQStash(request: Request, body: string, path: string): Promise<boolean> {
  const signature = request.headers.get("upstash-signature");
  if (!signature) return false;
  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
  });
  const url = `${process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/, "")}${path}`;
  try {
    return await receiver.verify({ signature, body, url });
  } catch {
    return false;
  }
}
