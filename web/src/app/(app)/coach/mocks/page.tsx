import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { BehavioralMockForm, DesignMockForm } from "@/components/coach/mock-picker";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import { designTopics, listMocks } from "@/lib/coach/mocks";
import { listStories } from "@/lib/coach/stories";
import { instantDate } from "@/lib/tracker/dates";
import { band } from "@/lib/tracker/readiness";

export const metadata: Metadata = { title: "Mocks" };

const SCORE_TEXT = { bad: "text-bad", warn: "text-warn", ok: "text-ok" } as const;
const STATUS_TEXT: Record<string, string> = { running: "In progress", abandoned: "Not scored" };

export default async function MocksPage() {
  const viewer = await requireViewer();
  const [topics, stories, past] = await Promise.all([designTopics(), listStories(viewer.id), listMocks(viewer.id)]);
  return (
    <>
      <div className="flex flex-col gap-2">
        <BackLink href="/coach">Coach</BackLink>
        <PageHeader title="Mock interviews" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        <DesignMockForm topics={topics} />
        <BehavioralMockForm stories={stories.length} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-heading font-semibold">Past mocks</h2>
        {past.length ? (
          <ul className="flex flex-col rounded-xl border border-line bg-surface">
            {past.map((m) => (
              <li key={m.id} className="border-t border-line first:border-0">
                <Link href={`/coach/mocks/${m.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:text-cyan">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{m.topic}</span>
                    <span className="text-small text-mute">
                      {m.type === "design" ? "Design" : "Behavioral"} · {instantDate(m.startedAt, viewer.timezone)}
                    </span>
                  </span>
                  {m.score != null ? (
                    <span className={`tabular font-display text-heading font-semibold ${SCORE_TEXT[band(m.score)]}`}>{m.score}</span>
                  ) : (
                    <span className="text-small text-mute">{STATUS_TEXT[m.status] ?? m.status}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No mocks yet">
            Your scores show up here after your first mock. Friends see the type, topic and score.
          </EmptyState>
        )}
      </section>
    </>
  );
}
