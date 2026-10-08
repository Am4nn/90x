"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { accept, dismiss, invite, refuse, revoke, unfriend } from "@/lib/friends/service";
import { logError } from "@/lib/log";
import { takeDailyCount } from "@/lib/upstash/rate-limit";
import { DAILY_LIMITS } from "@/lib/upstash/ratelimit";

const EmailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

/** A form's hidden id field, or null when missing — never an unsafe assertion. */
function field(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value ? value : null;
}

/**
 * The service throws curated sentences for the cases a person can cause. Anything
 * else is a driver or Postgres failure, and returning its text put things like
 * "connection terminated unexpectedly" - or a constraint name - in the UI. Every
 * other action in the app returns a fixed line (see admin/users/actions.ts), so
 * these do too, and the real error goes to the log.
 */
const EXPECTED = new Set([
  "Enter an email.",
  "That does not look like an email.",
  "You cannot invite yourself.",

  "You cannot accept your own invite.",
  "Invite is for a different email.",
  "Invite is no longer available.",
  "This invite has expired. Ask them to send a new one.",
]);

function friendlyError(e: unknown): string {
  const message = e instanceof Error ? e.message : "";
  if (EXPECTED.has(message)) return message;
  // These name the address or a count, so they are generated rather than fixed
  // strings and cannot be set members.
  if (/^You have \d+ pending invites\./.test(message)) return message;
  if (/^You are already friends with \S+\.$/.test(message)) return message;
  if (/^You have already invited \S+ \d+ times\./.test(message)) return message;
  return "That didn't work. Try again.";
}

export async function sendInviteAction(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const rawEmail = form.get("email");
  if (typeof rawEmail !== "string") return { error: "Enter an email." };
  const parsed = EmailSchema.safeParse(rawEmail);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid email" };

  // Every invite may send an email, so a sender has a daily allowance, counted atomically so a burst of
  // parallel requests cannot all slip under it. It fails closed: with the counter unreachable, nothing is sent.
  if (!(await takeDailyCount(viewer.id, "invite"))) {
    return { error: `You can send ${DAILY_LIMITS.invite} invites a day, and no more can go out right now. Try again later.` };
  }

  let result: Awaited<ReturnType<typeof invite>>;
  try {
    result = await invite(viewer.id, parsed.data);
  } catch (e) {
    logError("send invite failed", e);
    return { error: friendlyError(e) };
  }
  revalidatePath("/me");
  revalidatePath("/today");
  revalidatePath("/friends");
  // Say which of the three things happened. "Invite sent." was shown for all of
  // them, including the one that sends nothing.
  const to = parsed.data;
  if (result === "already-pending") {
    return { ok: true, note: `${to} already has an invite from you, still waiting. Nothing new was sent.` };
  }
  return { ok: true, note: result === "resent" ? `Invite emailed again to ${to}.` : `Invite emailed to ${to}.` };
}

/**
 * Accept, refuse or dismiss an invite addressed to the signed-in user's email.
 * Shared because the three differ only in the service call; the email gate, the
 * error handling and the revalidation are identical.
 */
async function respond(kind: "accept" | "refuse" | "dismiss", form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const inviteId = field(form, "inviteId");
  if (!inviteId) return { error: "Missing invite." };
  const email = viewer.email;
  if (!email) return { error: "Your account has no email to match invites to." };
  try {
    if (kind === "accept") await accept(inviteId, viewer.id, email);
    else if (kind === "refuse") await refuse(inviteId, email);
    else await dismiss(inviteId, email);
  } catch (e) {
    logError(`${kind} invite failed`, e);
    return { error: friendlyError(e) };
  }
  revalidatePath("/me");
  revalidatePath("/today");
  revalidatePath("/friends");
  return { ok: true };
}

export async function acceptAction(_: FormState, form: FormData): Promise<FormState> {
  return respond("accept", form);
}

export async function refuseAction(_: FormState, form: FormData): Promise<FormState> {
  return respond("refuse", form);
}

export async function dismissAction(_: FormState, form: FormData): Promise<FormState> {
  return respond("dismiss", form);
}

export async function revokeAction(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const inviteId = field(form, "inviteId");
  if (!inviteId) return { error: "Missing invite." };
  try {
    await revoke(inviteId, viewer.id);
  } catch (e) {
    logError("revoke invite failed", e);
    return { error: friendlyError(e) };
  }
  revalidatePath("/me");
  revalidatePath("/friends");
  return { ok: true };
}

export async function unfriendAction(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const otherId = field(form, "otherId");
  if (!otherId) return { error: "Missing friend." };
  try {
    await unfriend(viewer.id, otherId);
  } catch (e) {
    logError("unfriend failed", e);
    return { error: friendlyError(e) };
  }
  revalidatePath("/me");
  revalidatePath("/today");
  revalidatePath("/friends");
  return { ok: true };
}
