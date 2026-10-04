import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import { button } from "@/components/button-styles";
import { ActionForm, SubmitButton } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth/viewer";
import { AdminNav, backToApp } from "../admin-nav";
import { approveAllWaiting, decide } from "./actions";

export const metadata: Metadata = { title: "Users" };

type Row = { user_id: string; email: string; name: string; status: string; is_admin: boolean; requested_at: string };

export default async function AdminUsersPage() {
  const viewer = await requireAdmin();
  // Emails live in auth.users, which only the server connection can read.
  const rows = (await db.execute(sql`
    select a.user_id, u.email, p.name, a.status, a.is_admin, a.requested_at
    from public.user_approvals a
    join auth.users u on u.id = a.user_id
    left join public.profiles p on p.user_id = a.user_id
    order by (a.status = 'pending') desc, a.requested_at desc`)) as unknown as Row[];

  const groups = ["pending", "approved", "rejected"] as const;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageHeader title="Users" action={backToApp} />
      <AdminNav current="Users" />
      {groups.map((status) => {
        const list = rows.filter((r) => r.status === status);
        if (list.length === 0 && status !== "pending") return null;
        return (
          <section key={status} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-heading font-semibold capitalize">{status}</h2>
              <span className="text-small text-mute">{list.length}</span>
            </div>
            {status === "pending" && list.length > 0 && (
              <ActionForm action={approveAllWaiting} className="flex flex-col items-start gap-1.5">
                <SubmitButton pendingLabel="Approving…" className={button({ size: "sm" })}>
                  Approve everyone waiting ({list.length})
                </SubmitButton>
              </ActionForm>
            )}
            <div className="divide-y divide-line rounded-xl border border-line bg-surface">
              {list.length === 0 && <p className="p-4 text-small text-mute">Nobody waiting.</p>}
              {list.map((r) => (
                <div key={r.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{r.name || r.email}</div>
                    <div className="truncate text-small text-mute">
                      {r.email}
                      {r.is_admin ? " · admin" : ""}
                    </div>
                  </div>
                  {r.user_id !== viewer.id && (
                    <ActionForm action={decide} className="flex flex-col items-end gap-1.5">
                      <input type="hidden" name="userId" value={r.user_id} />
                      <div className="flex gap-2">
                        {status !== "approved" && (
                          <SubmitButton
                            name="status"
                            value="approved"
                            pendingLabel="Approving…"
                            className={button({ variant: "primary", size: "sm" })}
                          >
                            Approve
                          </SubmitButton>
                        )}
                        {status !== "rejected" && (
                          <SubmitButton name="status" value="rejected" pendingLabel="Saving…" className={button({ size: "sm" })}>
                            {status === "approved" ? "Revoke" : "Reject"}
                          </SubmitButton>
                        )}
                      </div>
                    </ActionForm>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
