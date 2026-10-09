import { plainName } from "../display-name";
import { type EmailInput } from "../email";
import { siteUrl } from "../site-url";

function escapeHtml(unsafe: string): string {
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Light is the BASE, authored inline so it survives every client (including ones that
// strip <head> styles). Dark is an UPGRADE for clients that ask for it via
// prefers-color-scheme. This is the reverse of the old template, which authored the
// dark console as the base: a dark-mode client then lightened the background while
// leaving the light text light, so the headline came out white on white. With light
// as the base, a client that ignores dark mode still reads, and one that honours it
// gets the real console palette.
const BG = "#f2f4f7";
const CARD = "#ffffff";
const BORDER = "#e4e7ec";
const INK = "#14161c";
const BODY = "#3a4350";
const SUB = "#5a6270";
const MUTE = "#6b7280";
const ACCENT = "#67e8f9";
const ON_ACCENT = "#06222a";
// No double quotes in the stack: FONT goes inside double-quoted style="..." attributes,
// and a `"` here would close the attribute early and drop every declaration after it.
const FONT = "Sora, Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Tell clients the email supports both schemes, then hand dark-mode ones the console.
const META = `
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
`;

// Two dark-mode mechanisms, same palette:
//  - prefers-color-scheme: Apple Mail, Gmail, Yahoo, ...
//  - [data-ogsc]/[data-ogsb]: Outlook.com and the Outlook apps tag each element they
//    recolour with those attributes instead. Those rules sit outside the media query
//    because Outlook ignores the query, and they only match when the attribute exists,
//    so they are inert everywhere else.
const SCHEMES = `
<style>
  :root { color-scheme: light dark; }

  @media (prefers-color-scheme: dark) {
    .x-bg { background-color: #0a0c10 !important; }
    .x-card { background-color: #0f1218 !important; border-color: #1f2429 !important; }
    .x-ink { color: #e6e9ef !important; }
    .x-body { color: #c7ccd6 !important; }
    .x-sub { color: #aeb5c2 !important; }
    .x-mute { color: #8b93a1 !important; }
    .x-rule { border-top-color: #1f2429 !important; }
    .x-btn { background-color: #67e8f9 !important; }
    .x-btn-link { color: #06222a !important; }
    .x-logo { box-shadow: 0 0 0 1px #262b36 !important; }
  }

  [data-ogsb] .x-bg, .x-bg[data-ogsb] { background-color: #0a0c10 !important; }
  [data-ogsb] .x-card, .x-card[data-ogsb] { background-color: #0f1218 !important; border-color: #1f2429 !important; }
  [data-ogsc] .x-ink, .x-ink[data-ogsc] { color: #e6e9ef !important; }
  [data-ogsc] .x-body, .x-body[data-ogsc] { color: #c7ccd6 !important; }
  [data-ogsc] .x-sub, .x-sub[data-ogsc] { color: #aeb5c2 !important; }
  [data-ogsc] .x-mute, .x-mute[data-ogsc] { color: #8b93a1 !important; }
  [data-ogsc] .x-rule, .x-rule[data-ogsc] { border-top-color: #1f2429 !important; }
  [data-ogsb] .x-btn, .x-btn[data-ogsb] { background-color: #67e8f9 !important; }
  [data-ogsc] .x-btn-link, .x-btn-link[data-ogsc] { color: #06222a !important; }
</style>
`;

const button = (label: string) => `
<table border="0" cellspacing="0" cellpadding="0">
  <tr>
    <td class="x-btn" align="center" bgcolor="${ACCENT}" style="border-radius:8px;">
      <a class="x-btn-link" href="${siteUrl()}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:600;color:${ON_ACCENT};text-decoration:none;border-radius:8px;">${label}</a>
    </td>
  </tr>
</table>
`;

const heading = (inner: string) =>
  `<p class="x-ink" style="margin:0;font-family:${FONT};font-weight:600;font-size:20px;line-height:28px;color:${INK};">${inner}</p>`;

const body = (inner: string) =>
  `<p class="x-body" style="margin:12px 0 24px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${BODY};">${inner}</p>`;

// Sender header: the 90x mark, top-left, alone. It already spells "90x", so no
// wordmark beside it (the old centered-logo + no identity was the problem).
const layout = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>${META}${SCHEMES}<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body class="x-bg x-ink" style="margin:0;padding:0;background-color:${BG};color:${INK};font-family:${FONT};-webkit-font-smoothing:antialiased;">
  <table width="100%" class="x-bg" border="0" cellspacing="0" cellpadding="0" bgcolor="${BG}">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;">
          <tr>
            <td align="left" style="padding:0 4px 20px 4px;">
              <img class="x-logo" src="${siteUrl()}/icons/icon-192.png" width="36" height="36" alt="90x" style="display:block;border-radius:8px;" />
            </td>
          </tr>
          <tr>
            <td class="x-card" bgcolor="${CARD}" style="padding:32px 32px 36px 32px;border-radius:12px;border:1px solid ${BORDER};">
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

/**
 * The inviter as the invite email names them: their first name only, as a plain label. The name
 * is whatever the inviter typed in Setup, and it lands in a subject line sent from 90x's own
 * domain, so a name like "Your bank: verify at evil.example" must not arrive as written.
 */
function inviterLabel(name: string): string {
  return plainName(name.trim().split(/\s+/)[0] ?? "", 30) || "A friend";
}

const INVITE_LINE = "Sign in with Google, then accept the invite on your Me page.";

export function friendInviteEmail(to: string, inviterName: string): EmailInput {
  const name = inviterLabel(inviterName);
  const safeName = escapeHtml(name);
  const text = `${name} invited you to 90x.\n\n${INVITE_LINE}\n\nOpen 90x: ${siteUrl()}\n\nQuestions? Reply to this email and someone from 90x will answer.\n\nYou're receiving this because someone entered your address on 90x. Not expecting it? You can ignore this email.`;

  const html = layout(`
    ${heading(`${safeName} invited you to 90x`)}
    ${body(INVITE_LINE)}
    ${button("Open 90x")}
    <p class="x-sub" style="margin:24px 0 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${SUB};">Questions? Reply to this email and someone from 90x will answer.</p>
    <hr class="x-rule" style="border:none;border-top:1px solid ${BORDER};margin:28px 0 0 0;" />
    <p class="x-mute" style="margin:16px 0 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTE};text-align:center;">You're receiving this because someone entered your address on 90x. Not expecting it? You can ignore this email.</p>
  `);

  return { to, subject: `${name} invited you to 90x`, html, text };
}

export type ProblemReportMail = {
  from: string;
  message: string;
  doing: string | null;
  path: string;
  userAgent: string | null;
  appVersion: string | null;
};

const lines = (s: string) => escapeHtml(s).replace(/\n/g, "<br>");

/** To the owner: someone reported a problem. Everything in it is the reporter's own text, so it is escaped. */
export function problemReportEmail(to: string, r: ProblemReportMail): EmailInput {
  const facts = [`From: ${r.from}`, `Page: ${r.path}`, `Version: ${r.appVersion ?? "unknown"}`, `Browser: ${r.userAgent ?? "unknown"}`];
  const text = [r.message, r.doing ? `Doing: ${r.doing}` : "", ...facts, `Open ${siteUrl()}admin/reports`].filter(Boolean).join("\n\n");
  const html = layout(`
    ${heading("New problem report")}
    ${body(lines(r.message))}
    ${r.doing ? body(`<strong>Doing:</strong> ${lines(r.doing)}`) : ""}
    <p class="x-sub" style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${SUB};">${facts.map(lines).join("<br>")}</p>
  `);
  return { to, subject: `90x problem report from ${r.from}`, html, text };
}

/** "You're in": sent only when an admin lets a waiting account in. Blocking and unblocking send nothing. */
export function approvalEmail(to: string): EmailInput {
  const text = `You're in\n\nSign in to set up your plan.\n\nOpen 90x: ${siteUrl()}`;
  const html = layout(`
    ${heading("You're in")}
    ${body("Sign in to set up your plan.")}
    ${button("Open 90x")}
  `);

  return { to, subject: "You're in: your 90x account is ready", html, text };
}

// A paragraph under the heading or under another paragraph. The card's own padding closes the last one.
const para = (inner: string) =>
  `<p class="x-body" style="margin:12px 0 0 0;font-family:${FONT};font-size:15px;line-height:24px;color:${BODY};">${inner}</p>`;

/** A heading and plain paragraphs with no button: the deletion notices. Every line is fixed copy, so nothing is escaped. */
function notice(to: string, title: string, paragraphs: string[]): EmailInput {
  const html = layout(`
    ${heading(title)}
    ${paragraphs.map(para).join("\n    ")}
  `);
  return { to, subject: title, html, text: [title, ...paragraphs].join("\n\n") };
}

/** To someone an admin deleted. Sent after the deletion succeeded. */
export function accountDeletedByAdminEmail(to: string): EmailInput {
  return notice(to, "Your 90x account was deleted", [
    "We deleted your 90x account and everything stored with it: answers, check-ins, Coach chats and memory, and progress. This can't be undone.",
    "If you didn't expect this, reply to this email.",
  ]);
}

/** To someone who deleted their own account. Sent after the deletion succeeded. */
export function accountDeletedEmail(to: string): EmailInput {
  return notice(to, "Your 90x account is deleted", [
    "You deleted your 90x account. Your answers, check-ins, Coach chats and memory, and progress are gone from our database, and from our backups within 14 days.",
    "You can come back any time: signing in again starts a new account.",
  ]);
}
