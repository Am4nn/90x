import { type EmailInput } from "../email";
import { siteUrl } from "../site-url";

function escapeHtml(unsafe: string): string {
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const BG = "#0a0c10";
const SURFACE = "#0f1218";
const TEXT = "#e6e9ef";
const MUTE = "#7d8594";
const ACCENT = "#67e8f9";
const FONT = 'Sora, Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const layout = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<body style="margin: 0; padding: 0; background-color: ${BG}; color: ${TEXT}; font-family: ${FONT}; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${BG}">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px;">
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <img src="${siteUrl()}/icons/icon-192.png" width="48" height="48" alt="90x" style="display: block; border-radius: 8px;" />
            </td>
          </tr>
          <tr>
            <td bgcolor="${SURFACE}" style="padding: 32px; border-radius: 12px; border: 1px solid #1f242f;">
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
  const text = `${inviterName} invited you to 90x.\n\nOpen 90x: ${siteUrl()}\n\nSign in with Google. Once your account is approved, accept the request from your dashboard.\n\nReply to this email if you have a question - someone reads it.\n\n90x is invite-only. You received this because someone entered your address.`;

  const html = layout(`
    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px;">
      <strong>${safeName}</strong> invited you to 90x.
    </p>
    <table border="0" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center" bgcolor="${ACCENT}" style="border-radius: 6px;">
          <a href="${siteUrl()}" target="_blank" style="display: inline-block; padding: 12px 24px; font-size: 16px; font-weight: 600; color: #000000; text-decoration: none; border-radius: 6px;">Open 90x</a>
        </td>
      </tr>
    </table>
    <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 22px; color: ${MUTE};">
      Sign in with Google. Once your account is approved, accept the request from your dashboard.
    </p>
    <p style="margin: 12px 0 0 0; font-size: 14px; line-height: 22px; color: ${MUTE};">
      Reply to this email if you have a question &mdash; someone reads it.
    </p>
    <hr style="border: none; border-top: 1px solid #1f242f; margin: 32px 0;" />
    <p style="margin: 0; font-size: 12px; line-height: 18px; color: ${MUTE}; text-align: center;">
      90x is invite-only. You received this because someone entered your address.
    </p>
  `);

  return { to, subject: `${inviterName} invited you to 90x`, html, text };
}

export function approvalEmail(to: string, approved: boolean): EmailInput {
  if (!approved) {
    return {
      to,
      subject: "Update on your 90x account",
      html: layout(`<p style="margin: 0; font-size: 16px; line-height: 24px;">Your 90x account request was declined.</p>`),
      text: "Your 90x account request was declined.",
    };
  }

  const text = `Your 90x account has been approved.\n\nOpen 90x: ${siteUrl()}`;
  const html = layout(`
    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px;">
      Your 90x account has been approved.
    </p>
    <table border="0" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center" bgcolor="${ACCENT}" style="border-radius: 6px;">
          <a href="${siteUrl()}" target="_blank" style="display: inline-block; padding: 12px 24px; font-size: 16px; font-weight: 600; color: #000000; text-decoration: none; border-radius: 6px;">Open 90x</a>
        </td>
      </tr>
    </table>
  `);

  return { to, subject: "Your 90x account is approved", html, text };
}
