// The shape of one outgoing email, apart from the sender (lib/email.ts is server-only), so the pure template
// code, which the admin's reply preview also runs in the browser, has no edge to it.
export type EmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extra message headers, e.g. In-Reply-To so a reply threads under the mail it answers. */
  headers?: Record<string, string>;
};
