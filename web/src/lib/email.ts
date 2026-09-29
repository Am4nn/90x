import "server-only";
import { Resend } from "resend";

// Email delivery via Resend. The two env vars are RESEND_API_KEY and
// EMAIL_FROM. Both must be set before any email is sent. See .env.example.

export type EmailInput = { to: string; subject: string; html: string; text: string };

/**
 * Send one email and return Resend's message id, or null if Resend returns no id.
 * Throws on configuration errors and Resend API errors. Only called through
 * {@link sendEmailBestEffort}; kept private so nothing sends without the guard.
 */
async function sendEmail(input: EmailInput): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("RESEND_API_KEY / EMAIL_FROM are not set");
  const { data, error } = await new Resend(key).emails.send({ from, ...input });
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

export type BestEffortEmail = {
  /** The user whose action triggered the send, for logging. */
  actorId: string;
  /** A short label recorded in the log entry (e.g. "invite", "approval"). */
  kind: string;
  email: EmailInput;
  /** Arbitrary context stored in the log entry. */
  payload: Record<string, unknown>;
};

/**
 * Fire-and-forget wrapper: a Resend outage must not roll back a committed
 * invite, approval, or other action. Delivery failures are logged with
 * console.error; the commit that triggered the send is not touched.
 *
 * 90x has no events table, so delivery events go to console rather than a
 * permanent record. If a structured events table is added later, replace the
 * console calls here.
 */
export async function sendEmailBestEffort(input: BestEffortEmail): Promise<void> {
  try {
    const emailId = await sendEmail(input.email);
    console.log(`email.${input.kind}.sent actor=${input.actorId} email_id=${emailId ?? "none"}`, input.payload);
  } catch (error) {
    // Keep the error record best-effort too: a second failure here must not
    // surface to the caller.
    try {
      console.error(`email.${input.kind}.failed actor=${input.actorId}`, input.payload, (error as Error).message);
    } catch {
      // Intentional: keep the side effect fully best-effort.
    }
  }
}
