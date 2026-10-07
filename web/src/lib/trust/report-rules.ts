// What a problem report may hold. Pure, so the action and the form share one set of limits.

/** Where reports and privacy questions go. Shown on the legal pages and to signed-out visitors. */
export const SUPPORT_EMAIL = "support@mail.90x.amanarya.com";

export const MESSAGE_MAX = 2000;
export const DOING_MAX = 1000;
const PATH_MAX = 300;
const FALLBACK_PATH = "/me/report";

export type Report = { message: string; doing: string | null; path: string };

/** The page the report is about, from the link that opened the form. Only an in-app path is kept,
 *  because the value comes from the address bar and ends up in an email. */
export function cleanPath(raw: unknown): string {
  if (typeof raw !== "string") return FALLBACK_PATH;
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.length > PATH_MAX || /[\s\\]/.test(path)) return FALLBACK_PATH;
  return path;
}

export function parseReport(raw: { message: unknown; doing: unknown; from: unknown }): { report: Report } | { error: string } {
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (!message) return { error: "Tell us what happened." };
  if (message.length > MESSAGE_MAX) return { error: `Keep it under ${MESSAGE_MAX} characters.` };
  const doing = typeof raw.doing === "string" ? raw.doing.trim() : "";
  if (doing.length > DOING_MAX) return { error: `Keep "what you were doing" under ${DOING_MAX} characters.` };
  return { report: { message, doing: doing || null, path: cleanPath(raw.from) } };
}
