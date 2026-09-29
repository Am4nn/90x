import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { button } from "@/components/button-styles";
import { PageHeader } from "@/components/page-header";
import { inboundEmail } from "@/lib/admin/mail";
import { formatUtc } from "@/lib/admin/mail-time";
import { requireViewer } from "@/lib/auth/viewer";
import { AdminNav } from "../../admin-nav";

export const metadata: Metadata = { title: "Message" };

const backToMail = (
  <Link href="/admin/mail" className={button({ size: "sm" })}>
    Back to mail
  </Link>
);

export default async function AdminMailMessagePage({ params }: PageProps<"/admin/mail/[id]">) {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const { id } = await params;
  const mail = await inboundEmail(id);
  if (!mail) notFound();

  const auth = mail.authentication
    ? Object.entries(mail.authentication).filter(([, v]) => typeof v === "string" || typeof v === "number")
    : [];
  const meta: [string, string][] = [
    ["From", mail.from],
    ["To", mail.to.join(", ") || "unknown"],
    ["Date", formatUtc(mail.createdAt)],
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageHeader title="Message" action={backToMail} />
      <AdminNav current="Mail" />
      <h2 className="font-display text-heading font-semibold break-words">{mail.subject}</h2>
      <dl className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3.5 text-small">
        {meta.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-12 shrink-0 text-mute">{k}</dt>
            <dd className="min-w-0 break-words text-text-2">{v}</dd>
          </div>
        ))}
        {auth.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-12 shrink-0 text-mute uppercase">{k}</dt>
            <dd className="min-w-0 break-words text-text-2">{String(v)}</dd>
          </div>
        ))}
      </dl>
      {mail.attachments > 0 && (
        <p className="text-small text-mute">
          {mail.attachments} attachment{mail.attachments === 1 ? "" : "s"} not shown here.
        </p>
      )}
      {mail.text ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-3.5 break-words whitespace-pre-wrap">{mail.text}</div>
      ) : (
        <p className="text-small text-mute">This message is HTML-only, so there is no text to show.</p>
      )}
    </main>
  );
}
