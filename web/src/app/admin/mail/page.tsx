import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { inboundEmails, lastSeenMailAt, markMailSeen } from "@/lib/admin/mail";
import { isUnread } from "@/lib/admin/mail-time";
import { requireAdmin } from "@/lib/auth/viewer";
import { AdminNav, backToApp } from "../admin-nav";

export const metadata: Metadata = { title: "Mail" };

// UTC so the server render is the same for every viewer.
const when = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) +
      " UTC"
    : "";

export default async function AdminMailPage() {
  const viewer = await requireAdmin();
  const [emails, seenAt] = await Promise.all([inboundEmails(), lastSeenMailAt(viewer.id)]);
  // Marked after the read, so this render still shows what was new.
  if (emails) await markMailSeen(viewer.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageHeader title="Mail" action={backToApp} />
      <AdminNav current="Mail" />
      {emails === null ? (
        <EmptyState title="Could not read mail">
          Resend did not answer, so this is not the same as no mail. Try again in a minute.
        </EmptyState>
      ) : emails.length === 0 ? (
        <EmptyState title="No mail yet">Nothing has been received. Replies to your invites will show up here.</EmptyState>
      ) : (
        <div className="divide-y divide-line rounded-xl border border-line bg-surface">
          {emails.map((e) => {
            const unread = isUnread(e.createdAt, seenAt);
            return (
              <Link
                key={e.id}
                href={`/admin/mail/${e.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <div className={`truncate ${unread ? "font-semibold" : "text-text-2"}`}>{e.subject}</div>
                  <div className="truncate text-small text-mute">{e.from}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-small text-mute">{when(e.createdAt)}</span>
                  {unread && <span className="text-tag font-semibold text-cyan">New</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
