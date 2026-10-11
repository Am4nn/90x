"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { inboundEmail, markMailReplied, repliedAt } from "@/lib/admin/mail";
import { formatUtc, instant } from "@/lib/admin/mail-time";
import { REPLY_BODY_MAX, REPLY_SUBJECT_MAX, replyRecipient } from "@/lib/admin/reply-rules";
import { adminViewer } from "@/lib/auth/viewer";
import { sendEmailChecked } from "@/lib/email";
import { hasControl } from "@/lib/email/control";
import { replyEmail } from "@/lib/email/templates";
import { takeSlot } from "@/lib/upstash/rate-limit";

// A reply sent this recently counts as the same one: a lost response followed by a second tap must not mail
// the sender twice.
const AGAIN_AFTER_MS = 60_000;

// The recipient is not an input: it is read from Resend again by the message id, so a forged form can only
// ever answer the sender of mail that really arrived.
const Input = z.object({
  id: z.string().min(1).max(100),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(REPLY_SUBJECT_MAX)
    .refine((s) => !hasControl(s)), // a line break would end the header
  body: z.string().trim().min(1).max(REPLY_BODY_MAX),
  quote: z.boolean(),
});

/** The Message-ID as threading headers, or none when it is not a plain single-line value. */
function threading(messageId: string | null): Record<string, string> | undefined {
  return messageId && !hasControl(messageId) ? { "In-Reply-To": messageId, References: messageId } : undefined;
}

/** Sends a branded reply to a received message from the support address, and marks the message replied. */
export async function sendReply(input: { id: string; subject: string; body: string; quote: boolean }): Promise<FormState> {
  const viewer = await adminViewer();
  if (!viewer) return { error: "Only admins can do that." };
  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    return { error: `The reply needs a one-line subject (up to ${REPLY_SUBJECT_MAX}) and a message (up to ${REPLY_BODY_MAX}).` };
  }
  const { id, subject, body, quote } = parsed.data;

  const mail = await inboundEmail(id);
  if (!mail) return { error: "Couldn't read that message from Resend. Try again." };
  const to = replyRecipient(mail);
  if (!to) return { error: "That message has no address to reply to." };

  const before = await repliedAt(id);
  const last = before ? instant(before) : null;
  if (last !== null && Date.now() - last < AGAIN_AFTER_MS) {
    return { error: "You just replied to this message. Give it a minute before sending another." };
  }

  // After the cheap checks, so a missing message or a malformed form does not spend the hour's allowance.
  const slot = await takeSlot(viewer.id, "reply");
  if (!slot.allowed)
    return { error: `That's a lot of replies. You can send more in ${Math.max(1, Math.ceil(slot.retryAfterSec / 60))} min.` };

  const email = replyEmail({
    to,
    subject,
    body,
    theirFrom: mail.from,
    theirDate: mail.createdAt,
    quote: quote ? mail.text : null,
  });
  const headers = threading(mail.messageId);
  const sent = await sendEmailChecked({ actorId: viewer.id, kind: "reply", email: headers ? { ...email, headers } : email });
  if (!sent.ok) return { error: sent.error };

  // The mail is out. markMailReplied logs and carries on if Redis is down, so this cannot turn it into an error.
  const at = await markMailReplied(id);
  revalidatePath("/admin/mail", "layout");
  return { ok: true, note: `Reply sent to ${to} · ${formatUtc(at)}` };
}
