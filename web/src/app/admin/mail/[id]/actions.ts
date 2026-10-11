"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { inboundEmail, markMailReplied } from "@/lib/admin/mail";
import { formatUtc } from "@/lib/admin/mail-time";
import { REPLY_BODY_MAX, REPLY_SUBJECT_MAX, replyRecipient } from "@/lib/admin/reply-rules";
import { adminViewer } from "@/lib/auth/viewer";
import { sendEmailChecked } from "@/lib/email";
import { replyEmail } from "@/lib/email/templates";
import { logError } from "@/lib/log";
import { takeSlot } from "@/lib/upstash/rate-limit";

// The recipient is not an input: it is read from Resend again by the message id, so a forged form can only
// ever answer the sender of mail that really arrived.
const Input = z.object({
  id: z.string().min(1).max(100),
  subject: z.string().trim().min(1).max(REPLY_SUBJECT_MAX),
  body: z.string().trim().min(1).max(REPLY_BODY_MAX),
  quote: z.boolean(),
});

/** Sends a branded reply to a received message from the support address, and marks the message replied. */
export async function sendReply(input: { id: string; subject: string; body: string; quote: boolean }): Promise<FormState> {
  const viewer = await adminViewer();
  if (!viewer) return { error: "Only admins can do that." };
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { error: `The reply needs a subject (up to ${REPLY_SUBJECT_MAX}) and a message (up to ${REPLY_BODY_MAX}).` };
  const { id, subject, body, quote } = parsed.data;

  const slot = await takeSlot(viewer.id, "reply");
  if (!slot.allowed)
    return { error: `That's a lot of replies. You can send more in ${Math.max(1, Math.ceil(slot.retryAfterSec / 60))} min.` };

  const mail = await inboundEmail(id);
  if (!mail) return { error: "Couldn't read that message from Resend. Try again." };
  const to = replyRecipient(mail);
  if (!to) return { error: "That message has no address to reply to." };

  const email = replyEmail({
    to,
    subject,
    body,
    theirFrom: mail.from,
    theirDate: mail.createdAt,
    quote: quote ? mail.text : null,
  });
  const sent = await sendEmailChecked({
    actorId: viewer.id,
    kind: "reply",
    email: mail.messageId ? { ...email, headers: { "In-Reply-To": mail.messageId, References: mail.messageId } } : email,
  });
  if (!sent.ok) return { error: sent.error };

  // The mail is out. A marker that fails to save must not turn that into an error the admin would retry.
  let at: string;
  try {
    at = await markMailReplied(id);
  } catch (e) {
    logError("reply marker failed", e);
    at = new Date().toISOString();
  }
  revalidatePath("/admin/mail", "layout");
  return { ok: true, note: `Reply sent to ${to} · ${formatUtc(at)}` };
}
