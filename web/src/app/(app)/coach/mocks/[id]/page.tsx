import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { MockHeader } from "@/components/coach/mock-header";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import { mockThreadHref } from "@/lib/coach/mock-rules";
import { mockView } from "@/lib/coach/mocks";
import { band } from "@/lib/tracker/readiness";

export const metadata: Metadata = { title: "Mock result" };

// Ending a mock from here runs the scoring call.
export const maxDuration = 60;

const BAND_TEXT = { bad: "text-bad", warn: "text-warn", ok: "text-ok" } as const;
// 1-5 on the same bands as readiness: 1-2 red, 3 yellow, 4-5 green.
const rubricBand = (score: number) => band(((score - 1) / 4) * 100);
const BAR = { bad: "bg-bad", warn: "bg-warn", ok: "bg-ok" } as const;

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-heading font-semibold">{title}</h2>
      <ul className="flex flex-col rounded-xl border border-line bg-surface">
        {items.map((item) => (
          <li key={item} className="border-t border-line px-4 py-3.5 text-text-2 first:border-0">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function MockResultPage({ params }: PageProps<"/coach/mocks/[id]">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const parsed = z.uuid().safeParse(id);
  const mock = parsed.success ? await mockView(viewer.id, parsed.data) : null;
  if (!mock) notFound();
  const thread = mockThreadHref(mock.id, mock.threadId);
  const date = new Date(mock.startedAt).toLocaleDateString("en", { month: "short", day: "numeric" });

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/coach/mocks" className="text-small text-mute hover:text-text-2">
          ← Mocks
        </Link>
        <PageHeader title={mock.topic} />
        <span className="text-small text-mute">
          {mock.type === "design" ? "Design mock" : "Behavioral mock"} · {date}
        </span>
      </div>

      {mock.status === "running" && (
        <div className="flex flex-col gap-3">
          <MockHeader mockId={mock.id} type={mock.type} topic={mock.topic} startedAt={mock.startedAt} running />
          <Link href={thread} className="text-small font-semibold text-cyan">
            Continue the interview
          </Link>
        </div>
      )}

      {mock.status === "abandoned" && (
        <EmptyState
          title="Not scored"
          action={
            <Link href="/coach/mocks" className="text-small font-semibold text-cyan">
              Start another mock
            </Link>
          }
        >
          This mock ended before you answered, or you started another one.
        </EmptyState>
      )}

      {mock.status === "done" && mock.score != null && (
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <section className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
            <div className="flex items-baseline gap-3">
              <span className={`tabular font-display text-display font-bold ${BAND_TEXT[band(mock.score)]}`}>{mock.score}</span>
              <span className="text-small text-mute">out of 100</span>
            </div>
            <div className="flex flex-col gap-4">
              {mock.rubric.map((r) => (
                <div key={r.key} className="flex flex-col gap-1.5">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                    <span className="text-small font-semibold text-text-2">{r.label}</span>
                    <span className={`tabular text-small font-semibold ${BAND_TEXT[rubricBand(r.score)]}`}>{r.score}/5</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className={`h-full rounded-full ${BAR[rubricBand(r.score)]}`} style={{ width: `${(r.score / 5) * 100}%` }} />
                  </div>
                  <span className="text-small text-mute">{r.evidence}</span>
                </div>
              ))}
            </div>
            <Link href={thread} className="text-small font-semibold text-cyan">
              Read the transcript
            </Link>
          </section>
          <div className="flex flex-col gap-6">
            {mock.strengths.length > 0 && <List title="Strengths" items={mock.strengths} />}
            {mock.improvements.length > 0 && <List title="To improve" items={mock.improvements} />}
          </div>
        </div>
      )}
    </>
  );
}
