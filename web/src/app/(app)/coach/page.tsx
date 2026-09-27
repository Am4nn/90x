import { randomUUID } from "node:crypto";
import type { UIMessage } from "ai";
import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { z } from "zod";
import { CoachChat } from "@/components/coach/chat";
import { MockThreadHeader } from "@/components/coach/mock-thread-header";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import { COACH_KINDS, whenLabel } from "@/lib/coach/chat-rules";
import { type CoachKind, modeFor } from "@/lib/coach/mode";
import "@/lib/coach/modes";
import { coachDegraded } from "@/lib/coach/model";
import { extractQuietThreads, findThread, getThread, listThreads, type Thread, threadMessages } from "@/lib/coach/threads";
import { localDate } from "@/lib/tracker/dates";

export const metadata: Metadata = { title: "Coach" };

// The mock header's End button runs the scoring call from this page.
export const maxDuration = 60;

const KIND_LABEL: Record<CoachKind, string> = { chat: "Chat", lesson: "Lesson", review: "Solution review", mock: "Mock" };

// Starters for threads opened from elsewhere (other pages link here with a kind).
const KIND_STARTERS: Partial<Record<CoachKind, string[]>> = {
  lesson: ["Teach me this pattern"],
  review: ["Walk me through the review"],
  mock: ["I'm ready. Start the interview."],
};

// Lessons live on the Pattern Map; mocks get their own page.
const MODES = [
  { href: "/coach?new=1", label: "Chat", hint: "Ask about your prep" },
  { href: "/library", label: "Lessons", hint: "Pick a pattern on the map" },
  { href: "/coach/mocks", label: "Mocks", hint: "Design and behavioral" },
];

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const isUuid = (v: string | undefined): v is string => z.uuid().safeParse(v).success;

function ThreadList({ threads, current, timezone }: { threads: Thread[]; current: string | null; timezone: string }) {
  if (!threads.length) return <EmptyState title="No chats yet">Ask Coach anything about your prep. Your chats show up here.</EmptyState>;
  const today = localDate(timezone);
  return (
    <ul className="flex flex-col rounded-xl border border-line bg-surface">
      {threads.map((t) => (
        <li key={t.id} className="border-t border-line first:border-0">
          <Link
            href={`/coach?t=${t.id}`}
            aria-current={t.id === current ? "page" : undefined}
            className={`flex flex-col gap-1 px-4 py-3.5 hover:bg-surface-2 ${t.id === current ? "bg-surface-2" : ""}`}
          >
            <span className="truncate font-semibold text-text">{t.title || KIND_LABEL[t.kind]}</span>
            <span className="text-small text-mute">
              {t.kind === "chat" ? "" : `${KIND_LABEL[t.kind]} · `}
              {whenLabel(localDate(timezone, new Date(t.updatedAt)), today)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function CoachPage({ searchParams }: PageProps<"/coach">) {
  const viewer = await requireViewer();
  const params = await searchParams;
  // A mock links its thread as ?kind=mock&ref=<mockId>&thread=<threadId>.
  const t = one(params.t) ?? one(params.thread);
  const kindParam = COACH_KINDS.find((k) => k === one(params.kind));
  const refParam = one(params.ref)?.trim().slice(0, 200) || null;
  const draft = one(params.q)?.slice(0, 2000);

  // Threads left quiet since the last visit: remember what mattered in them.
  after(() => extractQuietThreads(viewer.id));

  let thread = isUuid(t) ? await getThread(viewer.id, t) : null;
  if (!thread && !t && kindParam && refParam) thread = await findThread(viewer.id, kindParam, refParam);
  const kind: CoachKind = thread?.kind ?? kindParam ?? "chat";
  const ref = thread ? thread.ref : refParam;
  // A new thread's id is picked here, so the first message creates it and later ones find it.
  const threadId = thread?.id ?? (isUuid(t) ? t : randomUUID());
  const inThread = Boolean(thread || t || kindParam || params.new);

  const [threads, stored, degraded] = await Promise.all([
    listThreads(viewer.id),
    thread ? threadMessages(viewer.id, thread.id, 100) : Promise.resolve([]),
    coachDegraded(),
  ]);

  return (
    <>
      <PageHeader
        title="Coach"
        action={
          <Link
            href="/me/coach"
            className="flex h-9 items-center rounded-[10px] border border-line px-3 text-small font-semibold text-text-2 hover:text-text"
          >
            What Coach knows
          </Link>
        }
      />

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] md:gap-8">
        <aside className={`${inThread ? "hidden md:flex" : "flex"} flex-col gap-6`}>
          <nav
            aria-label="Coach modes"
            className="grid grid-cols-3 gap-2.5 md:grid-cols-1 md:gap-0 md:rounded-xl md:border md:border-line md:bg-surface"
          >
            {MODES.map((m) => (
              <Link
                key={m.label}
                href={m.href}
                className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 hover:bg-surface-2 md:rounded-none md:border-0 md:border-t md:px-4 md:py-3.5 md:first:border-0"
              >
                <span className="font-display text-heading font-semibold">{m.label}</span>
                <span className="text-small text-mute">{m.hint}</span>
              </Link>
            ))}
          </nav>
          <Link
            href="/coach?new=1"
            className="flex h-11 items-center justify-center rounded-xl bg-cyan font-semibold text-on-cyan md:hidden"
          >
            New chat
          </Link>
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-heading font-semibold">Recent</h2>
            <ThreadList threads={threads} current={thread?.id ?? null} timezone={viewer.timezone} />
          </section>
        </aside>

        <section className={`${inThread ? "flex" : "hidden md:flex"} flex-col gap-3`}>
          <Link href="/coach" className="text-small font-semibold text-text-2 hover:text-text md:hidden">
            ← All chats
          </Link>
          {kind === "mock" && ref && <MockThreadHeader userId={viewer.id} mockId={ref} />}
          {modeFor(kind) ? (
            <CoachChat
              key={threadId}
              threadId={threadId}
              kind={kind}
              refValue={ref}
              title={thread?.title || (kind === "chat" ? "New chat" : KIND_LABEL[kind])}
              initialMessages={stored as UIMessage[]}
              // Mock threads end from the mock header, which scores and extracts memory itself.
              ended={kind === "mock" || Boolean(thread?.memoryExtractedAt)}
              degraded={degraded}
              draft={draft}
              starters={KIND_STARTERS[kind]}
            />
          ) : (
            <EmptyState
              title={`${KIND_LABEL[kind]}s aren't here yet`}
              action={
                <Link href="/coach?new=1" className="text-small font-semibold text-cyan">
                  Start a chat instead
                </Link>
              }
            >
              This part of Coach is still being built.
            </EmptyState>
          )}
        </section>
      </div>
    </>
  );
}
