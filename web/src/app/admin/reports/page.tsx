import { desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { users } from "@/db/auth";
import { problemReports } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/viewer";
import { libraryGaps } from "@/lib/coach/gaps";
import { relative } from "@/lib/format/time";
import { instantDate } from "@/lib/tracker/dates";
import { AdminNav, backToApp } from "../admin-nav";
import { ClearGap } from "./clear-gap";
import { ResolveToggle } from "./resolve-toggle";

export const metadata: Metadata = { title: "Reports" };

// Resolved reports are history, so only the latest are listed.
const RESOLVED_SHOWN = 30;

export default async function AdminReportsPage() {
  const viewer = await requireAdmin();
  const columns = {
    id: problemReports.id,
    message: problemReports.message,
    doing: problemReports.doing,
    path: problemReports.path,
    userAgent: problemReports.userAgent,
    appVersion: problemReports.appVersion,
    createdAt: problemReports.createdAt,
    resolvedAt: problemReports.resolvedAt,
    email: users.email,
  };
  const [open, resolved, gaps] = await Promise.all([
    db
      .select(columns)
      .from(problemReports)
      .leftJoin(users, eq(users.id, problemReports.userId))
      .where(isNull(problemReports.resolvedAt))
      .orderBy(desc(problemReports.createdAt)),
    db
      .select(columns)
      .from(problemReports)
      .leftJoin(users, eq(users.id, problemReports.userId))
      .where(isNotNull(problemReports.resolvedAt))
      .orderBy(desc(problemReports.resolvedAt))
      .limit(RESOLVED_SHOWN),
    libraryGaps(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageHeader title="Reports" action={backToApp} />
      <AdminNav current="Home" />
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-heading font-semibold">Open ({open.length})</h2>
        {open.length === 0 && <EmptyState title="Nothing open">Problem reports from the app land here, and in your inbox.</EmptyState>}
        {open.map((r) => (
          <Report key={r.id} r={r} />
        ))}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-heading font-semibold">Topics the Library doesn&apos;t cover</h2>
        {gaps.length === 0 && (
          <EmptyState title="Nothing yet">When Coach can&apos;t find a topic in the Library, it shows up here.</EmptyState>
        )}
        {gaps.length > 0 && (
          <div role="list" className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {gaps.map((g) => (
              <div key={g.topic} role="listitem" className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-text">{g.topic}</div>
                  <div className="truncate text-small text-mute">
                    {g.topicSlug && "in taxonomy · "}
                    {g.asks === 1 ? "1 ask" : `${g.asks} asks`} · last asked {instantDate(g.lastAskedAt, viewer.timezone)}
                    {g.lessonExists && " · Has a lesson now"}
                  </div>
                </div>
                <ClearGap topic={g.topic} />
              </div>
            ))}
          </div>
        )}
      </section>
      {resolved.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-heading font-semibold">Resolved</h2>
          {resolved.map((r) => (
            <Report key={r.id} r={r} />
          ))}
        </section>
      )}
    </main>
  );
}

type Row = {
  id: string;
  message: string;
  doing: string | null;
  path: string | null;
  userAgent: string | null;
  appVersion: string | null;
  createdAt: string;
  resolvedAt: string | null;
  email: string | null;
};

function Report({ r }: { r: Row }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2 text-small">
        <span className="min-w-0 truncate font-semibold text-text">{r.email ?? "deleted account"}</span>
        <span className="tabular text-mute">{relative(r.createdAt)}</span>
      </header>
      <p className="text-body break-words whitespace-pre-wrap text-text">{r.message}</p>
      {r.doing && (
        <p className="text-small break-words whitespace-pre-wrap text-text-2">
          <span className="text-mute">Doing: </span>
          {r.doing}
        </p>
      )}
      <p className="text-small break-words text-mute">
        {r.path ?? "no page"} · {r.appVersion ?? "unknown version"} · {r.userAgent ?? "unknown browser"}
      </p>
      <ResolveToggle id={r.id} resolved={r.resolvedAt !== null} />
    </article>
  );
}
