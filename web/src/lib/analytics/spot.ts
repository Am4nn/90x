// Which sign-in button a visitor pressed, kept in a one-hour first-party cookie until the sign-in
// callback copies it once onto a new profile. Pure on purpose: the client writes it, the server reads it.

export const SPOT_COOKIE = "x90_spot";
const SPOT_COOKIE_SECONDS = 3600;
export const SIGN_IN_SPOTS = ["hero", "close", "try", "maintenance"] as const;
export type SignInSpot = (typeof SIGN_IN_SPOTS)[number];

/** The spot named by a cookie value, or null for anything else (missing, junk, wrong case). */
export function parseSpot(raw: string | null | undefined): SignInSpot | null {
  return SIGN_IN_SPOTS.find((spot) => spot === raw) ?? null;
}

/** The `document.cookie` string for a pressed button. */
export function spotCookie(spot: SignInSpot, secure: boolean): string {
  return `${SPOT_COOKIE}=${spot}; Path=/; Max-Age=${SPOT_COOKIE_SECONDS}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
