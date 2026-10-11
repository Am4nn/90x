import { hasControl } from "@/lib/email/control";
import { siteUrl } from "@/lib/site-url";

// What an admin reply is made of, kept apart from the form and the action so both use the same limits and a
// test can read the copy.

export const REPLY_BODY_MAX = 5000;
export const REPLY_SUBJECT_MAX = 200;

export type QuickReply = { label: string; text: string };

/** The preset answers. A chip replaces the box's text with one of these, and the admin edits from there. */
export const quickReplies = (): QuickReply[] => [
  { label: "Thanks", text: "Thanks for writing in! We've read your message and we'll get back to you soon." },
  {
    label: "Looking into it",
    text: "Thanks for flagging this. We're looking into it now and will let you know as soon as it's sorted.",
  },
  { label: "Fixed", text: "Good news: this is fixed now. Give the app a refresh, and if you still see it, just reply here." },
  { label: "Feature idea", text: "Love this idea, thank you. We've added it to the list and we'll let you know if it ships." },
  { label: "You're in", text: `You're in! Your account is approved, so you can sign in at ${siteUrl()} and start your plan.` },
  {
    label: "No thanks",
    text: "Thanks for thinking of 90x. It's not something we're looking at right now, but we appreciate you reaching out.",
  },
];

// Re:, RE:, AW: and SV: (what German and Nordic clients write), with an optional count as in Re[2]:.
const REPLY_PREFIX = /^(?:re|aw|sv)(?:\[\d+\])?:/i;

/** `Re: <subject>`, without stacking a second prefix on one that has it, and short enough for the subject field. */
export function replySubject(subject: string): string {
  const s = subject.trim();
  return Array.from(REPLY_PREFIX.test(s) ? s : `Re: ${s}`)
    .slice(0, REPLY_SUBJECT_MAX)
    .join("");
}

// One mailbox out of a header value. A From or Reply-To can legally list several, and the first is the one a
// reply goes to; the address is returned bare, so no display name or second mailbox travels with it.
const ANGLE_ADDRESS = /<([^\s<>,@]+@[^\s<>,@]+)>/;
const BARE_ADDRESS = /^\s*([^\s<>,@]+@[^\s<>,@]+)\s*(?:,|$)/;

function mailbox(header: string): string | null {
  const address = ANGLE_ADDRESS.exec(header)?.[1] ?? BARE_ADDRESS.exec(header)?.[1] ?? null;
  return address && !hasControl(address) ? address : null;
}

/** Who a reply goes to: the first reply-to address if they set one, else the sender. One bare address, or null. */
export function replyRecipient(mail: { from: string; replyTo: string[] }): string | null {
  return mailbox(mail.replyTo[0] ?? "") ?? mailbox(mail.from);
}

// Senders nobody reads: a reply to a bounce or a no-reply address is wasted, and one to the app's own sending
// domain lands back in this inbox (Reply-To is the From address), where an auto-responder could answer it.
const AUTOMATED_LOCAL = /^(?:mailer-daemon|postmaster|no-?reply|do-?not-?reply)$/i;

/** The domain mail from the app is sent from (EMAIL_FROM's), lower case, or null when it is unset or not an address. */
function ownDomain(): string | null {
  const from = process.env.EMAIL_FROM;
  const address = from ? mailbox(from) : null;
  return address ? address.slice(address.lastIndexOf("@") + 1).toLowerCase() : null;
}

/** True when there is nothing to reply to: an automated sender, or an address on the app's own sending domain. */
export function unreplyable(address: string): boolean {
  const at = address.lastIndexOf("@");
  if (at < 0) return false;
  return AUTOMATED_LOCAL.test(address.slice(0, at)) || address.slice(at + 1).toLowerCase() === ownDomain();
}

/**
 * Reasons to doubt that answering this message is safe, for a line above the reply box: the reply would go to
 * somewhere other than the sender, or Resend judged the sender unauthenticated.
 */
export function replyWarnings(mail: { from: string; authentication: Record<string, unknown> | null }, to: string): string[] {
  const warnings: string[] = [];
  const sender = mailbox(mail.from);
  if (sender && sender.toLowerCase() !== to.toLowerCase()) warnings.push(`Replies go to ${to}, not the sender ${sender}.`);
  const failed = Object.entries(mail.authentication ?? {}).some(
    ([k, v]) => ["spf", "dkim", "dmarc"].includes(k.toLowerCase()) && typeof v === "string" && v.toLowerCase() !== "pass",
  );
  if (failed) warnings.push("This message failed sender checks.");
  return warnings;
}
