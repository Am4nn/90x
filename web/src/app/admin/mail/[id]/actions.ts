"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { claimReplyLock, inboundEmail, markMailReplied, releaseReplyLock } from "@/lib/admin/mail";
import { formatUtc } from "@/lib/admin/mail-time";
import { REPLY_BODY_MAX, REPLY_SUBJECT_MAX, replyRecipient, unreplyable } from "@/lib/admin/reply-rules";
import { adminViewer } from "@/lib/auth/viewer";
import { sendEmailChecked } from "@/lib/email";
import { hasControl } from "@/lib/email/control";
import { replyEmail } from "@/lib/email/templates";
import { takeSlot } from "@/lib/upstash/rate-limit";

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

  if (unreplyable(to)) return { error: "That sender is automated, so there's nothing to reply to." };

  // Taken before the send and kept for a minute after it, so a double tap or a retry after a lost response cannot
  // mail the sender twice. Given back if nothing went out.
  const lock = await claimReplyLock(id);
  if (lock === "down")
    return { error: "Couldn't check whether a reply was already sent (Redis is unavailable), so nothing was sent. Try again soon." };
  if (lock === "held") return { error: "You just replied to this message. Give it a minute before sending another." };

  // After the cheap checks, so a missing message or a malformed form does not spend the hour's allowance.
  const slot = await takeSlot(viewer.id, "reply");
  if (!slot.allowed) {
    await releaseReplyLock(id);
    // No wait time means the limiter itself could not answer.
    return {
      error:
        slot.retryAfterSec > 0
          ? `That's a lot of replies. You can send more in ${Math.ceil(slot.retryAfterSec / 60)} min.`
          : "Couldn't check the hourly reply limit (Redis is unavailable), so nothing was sent. Try again soon.",
    };
  }

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
  if (!sent.ok) {
    await releaseReplyLock(id);
    return { error: sent.error };
  }

  // The mail is out. markMailReplied logs and carries on if Redis is down, so this cannot turn it into an error.
  const at = await markMailReplied(id);
  revalidatePath("/admin/mail", "layout");
  return { ok: true, note: `Reply sent to ${to} · ${formatUtc(at)}` };
}
