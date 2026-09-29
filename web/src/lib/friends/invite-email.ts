// Pure invite-address normalization and validation. No `server-only` import so
// the unit tests can load it.

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Trim and lowercase an address, or throw the message the invite form shows. */
export function normalizeInviteEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!email) throw new Error("Enter an email.");
  if (!EMAIL_RE.test(email)) throw new Error("That does not look like an email.");
  return email;
}
