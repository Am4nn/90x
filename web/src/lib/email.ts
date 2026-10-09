import "server-only";
import { Resend } from "resend";
import { safeError } from "@/lib/log";
import { skippedForMaintenance } from "@/lib/maintenance/flag";

// Email delivery via Resend. The two env vars are RESEND_API_KEY and
// EMAIL_FROM. Both must be set before any email is sent. See .env.example.

export type EmailInput = { to: string; subject: string; html: string; text: string };

/**
 * Send one email and return Resend's message id, or null if Resend returns no id.
 * Throws on configuration errors and Resend API errors. Only called through
 * {@link sendEmailBestEffort}; kept private so nothing sends without the guard.
 */
/** A failed send. The message is a fixed line or Resend's error code, never Resend's text (which can name the address). */
class EmailSendError extends Error {
  override name = "EmailSendError";
}

async function sendEmail(input: EmailInput): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new EmailSendError("RESEND_API_KEY / EMAIL_FROM are not set");
  // Reply-To is the From address, deliberately. mail.90x.amanarya.com has
  // receiving enabled, so a reply is not lost the way a reply to a no-reply
  // address is - it lands in Resend and is read at /admin/mail. Setting it here
  // rather than per template means no future email can forget it.
  const { data, error } = await new Resend(key).emails.send({ from, replyTo: from, ...input });
  if (error) throw new EmailSendError(`Resend refused the send: ${error.name}`);
  return data?.id ?? null;
}

export type BestEffortEmail = {
  /** The user whose action triggered the send, for logging. */
  actorId: string;
  /** A short label recorded in the log entry (e.g. "invite", "approval"). */
  kind: string;
  email: EmailInput;
  /** Context for the log entry. Only LOGGED_FIELDS with plain values are printed (loggedPayload). */
  payload: Record<string, unknown>;
  /**
   * Send even while maintenance is on. Only for an email that reports something already done and
   * promised in the Terms and Privacy policy: the two account-deleted notices. Everything else
   * (invites, You're in) would only lead to the maintenance page, so it is skipped.
   */
  evenInMaintenance?: boolean;
};

// The payload fields a send log may print: ids, statuses and numbers, never an address, a path or text.
const LOGGED_FIELDS = new Set(["invite_id", "target_id", "status", "bulk", "period", "level", "spent", "cap"]);

/** The allowlisted, plain-valued part of a payload, for the log. */
export function loggedPayload(payload: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (LOGGED_FIELDS.has(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) out[k] = v;
  }
  return out;
}

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
  // While the app is down no email goes out: an invite or an approval would only lead to the maintenance page.
  if (!input.evenInMaintenance && (await skippedForMaintenance(`email.${input.kind}`, { actor: input.actorId }))) return;
  try {
    const emailId = await sendEmail(input.email);
    console.log(`email.${input.kind}.sent actor=${input.actorId} email_id=${emailId ?? "none"}`, loggedPayload(input.payload));
  } catch (error) {
    // Keep the error record best-effort too: a second failure here must not
    // surface to the caller.
    try {
      console.error(`email.${input.kind}.failed actor=${input.actorId}`, loggedPayload(input.payload), safeError(error));
    } catch {
      // Intentional: keep the side effect fully best-effort.
    }
  }
}
