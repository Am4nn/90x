import { isNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { problemReports } from "@/db/schema";
import { flaggedCount, listBatches } from "@/lib/admin/cards";
import { budget } from "@/lib/ai/usage";
import { requireAdmin } from "@/lib/auth/viewer";
import { AdminNav, backToApp } from "./admin-nav";

export const metadata: Metadata = { title: "Admin" };

function Tile({ href, title, value, detail, tone }: { href: string; title: string; value: string; detail: string; tone?: string }) {
  return (
    <Link href={href} className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-5 hover:border-line-2">
      <span className="text-small text-mute">{title}</span>
      <span className={`tabular font-display text-display font-bold ${tone ?? ""}`}>{value}</span>
      <span className="text-small text-text-2">{detail}</span>
    </Link>
  );
}

export default async function AdminHome() {
  await requireAdmin();
  const [users, batches, flagged, ai, reports] = await Promise.all([
    db.execute<{ pending: number; approved: number }>(sql`
      select count(*) filter (where status = 'pending')::int as pending,
             count(*) filter (where status = 'approved')::int as approved
      from public.user_approvals`),
    listBatches(),
    flaggedCount(),
    budget(),
    db.$count(problemReports, isNull(problemReports.resolvedAt)),
  ]);
  const u = users[0] ?? { pending: 0, approved: 0 };
  const drafts = batches.filter((b) => b.status === "draft");
  const live = batches.filter((b) => b.status === "published").reduce((n, b) => n + b.cardCount, 0);
  const spendTone = ai.state === "over" ? "text-bad" : ai.state === "warn" ? "text-warn" : "";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageHeader title="Admin" action={backToApp} />
      <AdminNav current="Home" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Tile
          href="/admin/users"
          title="Users"
          value={String(u.pending)}
          detail={`${u.pending === 1 ? "person" : "people"} waiting · ${u.approved} approved`}
          tone={u.pending ? "text-cyan" : ""}
        />
        <Tile
          href="/admin/cards"
          title="Card batches to review"
          value={String(drafts.length)}
          detail={`${live.toLocaleString()} cards live in the Feed`}
          tone={drafts.length ? "text-cyan" : ""}
        />
        <Tile
          href="/admin/cards/flagged"
          title="Flagged cards"
          value={String(flagged)}
          detail="Hidden until you keep or retire them"
          tone={flagged ? "text-warn" : ""}
        />
        <Tile
          href="/admin/reports"
          title="Problem reports"
          value={String(reports)}
          detail={reports === 1 ? "open report" : "open reports"}
          tone={reports ? "text-warn" : ""}
        />
        <Tile
          href="/admin/settings"
          title="AI spend this month"
          value={`$${ai.spent.toFixed(2)}`}
          detail={`of $${ai.limit.toFixed(0)} · ${ai.state === "over" ? "Coach is on the lighter model" : ai.state === "warn" ? "over 80%" : "within budget"}`}
          tone={spendTone}
        />
      </div>
    </main>
  );
}
