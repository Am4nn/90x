import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import { button } from "@/components/button-styles";
import { ActionForm, SubmitButton } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { deletedAccounts } from "@/lib/account/deleted";
import { requireAdmin } from "@/lib/auth/viewer";
import { getSettings } from "@/lib/settings";
import { instantDate } from "@/lib/tracker/dates";
import { AdminNav, backToApp } from "../admin-nav";
import { approveAllWaiting } from "./actions";
import { UserRow } from "./user-row";

export const metadata: Metadata = { title: "Users" };

type Row = {
  user_id: string;
  email: string;
  name: string | null;
  status: "pending" | "approved" | "rejected";
  is_admin: boolean;
  signed_up_at: string | Date;
  decided_at: string | Date | null;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Section({ title, count, note, children }: { title: string; count: number; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-heading font-semibold">
          {title} ({count})
        </h2>
        {note && <span className="text-small text-mute">{note}</span>}
      </div>
      {children}
    </section>
  );
}

const LIST = "divide-y divide-line rounded-xl border border-line bg-surface";

/** A section's rows. Each child is one `role="listitem"` (the e2e spec finds rows by it). */
function List({ children }: { children: React.ReactNode }) {
  return (
    <div role="list" className={LIST}>
      {children}
    </div>
  );
}

/** A row with no actions: yours, and any other admin's (admins are changed by hand, so neither Block nor Delete is offered). */
function PlainRow({ name, meta }: { name: string; meta: string }) {
  return (
    <div role="listitem" className="px-4 py-3.5">
      <div className="truncate font-semibold">{name}</div>
      <div className="truncate text-small text-mute">{meta}</div>
    </div>
  );
}

export default async function AdminUsersPage() {
  const viewer = await requireAdmin();
  // The app's one date style ("Oct 3"), on the admin's own calendar.
  const day = (at: string | Date) => instantDate(at, viewer.timezone);
  /** One person's row: yours and other admins' carry no actions; everyone else's has their section's buttons. */
  const row = (r: Row, kind: "waiting" | "active" | "blocked") => {
    const blockedOn = kind === "blocked" && r.decided_at ? ` · blocked ${day(r.decided_at)}` : "";
    if (r.user_id === viewer.id) return <PlainRow key={r.user_id} name={r.name || r.email} meta={`${r.email} · you · admin`} />;
    if (r.is_admin)
      return (
        <PlainRow key={r.user_id} name={r.name || r.email} meta={`${r.email} · admin · signed up ${day(r.signed_up_at)}${blockedOn}`} />
      );
    return (
      <div key={r.user_id} role="listitem">
        <UserRow
          userId={r.user_id}
          name={r.name ?? ""}
          email={r.email}
          meta={`${r.email} · signed up ${day(r.signed_up_at)}${blockedOn}`}
          kind={kind}
        />
      </div>
    );
  };
  // Emails live in auth.users, which only the server connection can read.
  const [rows, deleted, settings] = await Promise.all([
    db.execute(sql`
      select a.user_id, u.email, p.name, a.status, a.is_admin, u.created_at as signed_up_at, a.decided_at
      from public.user_approvals a
      join auth.users u on u.id = a.user_id
      left join public.profiles p on p.user_id = a.user_id
      order by a.requested_at desc`) as unknown as Promise<Row[]>,
    deletedAccounts(),
    getSettings({ fresh: true }),
  ]);

  const waiting = rows.filter((r) => r.status === "pending");
  const active = rows.filter((r) => r.status === "approved");
  const blocked = rows.filter((r) => r.status === "rejected");
  const showWaiting = waiting.length > 0 || !settings.autoApprove;
  const { recent, total } = deleted;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageHeader title="Users" action={backToApp} />
      <AdminNav current="Users" />
      <p className="text-small text-mute">
        {active.length} active · {blocked.length} blocked · {recent.length} deleted in the last 90 days · {total} deleted in all
      </p>

      {showWaiting && (
        <Section title="Waiting" count={waiting.length} note={settings.autoApprove ? undefined : "Auto-approve is off"}>
          {waiting.length > 0 && (
            <ActionForm action={approveAllWaiting} className="flex flex-col items-start gap-1.5">
              <SubmitButton pendingLabel="Letting in…" className={`${button({ size: "sm" })} max-sm:h-11`}>
                Let everyone in ({waiting.length})
              </SubmitButton>
            </ActionForm>
          )}
          {waiting.length === 0 ? (
            <p className={`${LIST} p-4 text-small text-mute`}>Nobody waiting.</p>
          ) : (
            <List>{waiting.map((r) => row(r, "waiting"))}</List>
          )}
        </Section>
      )}

      <Section title="Active" count={active.length}>
        <List>{active.map((r) => row(r, "active"))}</List>
      </Section>

      {blocked.length > 0 && (
        <Section title="Blocked" count={blocked.length}>
          <List>{blocked.map((r) => row(r, "blocked"))}</List>
        </Section>
      )}

      {total > 0 && (
        <Section title="Deleted · last 90 days" count={recent.length}>
          {recent.length > 0 && (
            <List>
              {recent.map((d) => (
                <div key={d.id} role="listitem" className="px-4 py-3.5">
                  <div className="truncate text-mute">
                    {d.email}
                    {d.name ? ` · ${d.name}` : ""}
                  </div>
                  <div className="truncate text-small text-mute">
                    Deleted by {d.deletedBy === "admin" ? "an admin" : "themselves"} · {day(d.deletedAt)}
                    {d.signedUpAt ? ` · signed up ${day(d.signedUpAt)}` : ""}
                  </div>
                </div>
              ))}
            </List>
          )}
          <p className="text-tag leading-chip text-mute">
            {plural(total, "account", "accounts")} deleted since launch. A record is kept 90 days, then only the count.
          </p>
        </Section>
      )}
    </main>
  );
}
