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

/** `Re: <subject>`, without stacking a second Re: on a subject that already has one. */
export function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
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
