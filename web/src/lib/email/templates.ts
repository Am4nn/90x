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

export function friendInviteEmail(to: string, inviterName: string): EmailInput {
  const safeName = escapeHtml(inviterName);
  const text = `${inviterName} invited you to 90x.\n\nSign in with Google. 90x is invite-only, so your account needs approval first. You can accept the request from your dashboard once it's approved.\n\nOpen 90x: ${siteUrl()}\n\nQuestions? Reply to this email and someone from 90x will answer.\n\nYou're receiving this because someone entered your address on 90x.`;

  const html = layout(`
    ${heading(`${safeName} invited you to 90x`)}
    ${body("Sign in with Google. 90x is invite-only, so your account needs approval first. You can accept the request from your dashboard once it's approved.")}
    ${button("Open 90x")}
    <p class="x-sub" style="margin:24px 0 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${SUB};">Questions? Reply to this email and someone from 90x will answer.</p>
    <hr class="x-rule" style="border:none;border-top:1px solid ${BORDER};margin:28px 0 0 0;" />
    <p class="x-mute" style="margin:16px 0 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTE};text-align:center;">You're receiving this because someone entered your address on 90x.</p>
  `);

  return { to, subject: `${inviterName} invited you to 90x`, html, text };
}

export function approvalEmail(to: string, approved: boolean): EmailInput {
  if (!approved) {
    return {
      to,
      subject: "Update on your 90x account",
      html: layout(heading("Your 90x account request was declined.")),
      text: "Your 90x account request was declined.",
    };
  }

  const text = `Your 90x account is approved.\n\nSign in to set up your campaign.\n\nOpen 90x: ${siteUrl()}`;
  const html = layout(`
    ${heading("Your 90x account is approved")}
    ${body("Sign in to set up your campaign.")}
    ${button("Open 90x")}
  `);

  return { to, subject: "Your 90x account is approved", html, text };
}
