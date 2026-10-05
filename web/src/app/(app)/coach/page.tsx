import { randomUUID } from "node:crypto";
import type { UIMessage } from "ai";
import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { BackLink } from "@/components/back-link";
import { button } from "@/components/button-styles";
import { CoachChat } from "@/components/coach/chat";
import { MockThreadHeader } from "@/components/coach/mock-thread-header";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Bar, RowsSkeleton } from "@/components/skeleton";
import { requireViewer } from "@/lib/auth/viewer";
import "@/lib/coach/modes";
import { COACH_KINDS, whenLabel } from "@/lib/coach/chat-rules";
import { type CoachKind, modeFor } from "@/lib/coach/mode";
import { coachDegraded } from "@/lib/coach/model";
import { extractQuietThreads, findThread, getThread, listThreads, type Thread, threadMessages } from "@/lib/coach/threads";
import { latestWeekly } from "@/lib/coach/weekly";
import { weekLabel } from "@/lib/coach/weekly-rules";
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

// Lessons and mocks have their own pages; the story bank keeps the page it has.
const MODES: { href: string; label: string; hint: string }[] = [
  { href: "/coach?new=1", label: "Chat", hint: "Ask about your prep" },
  { href: "/coach/lessons", label: "Lessons", hint: "Pick a pattern to learn" },
  { href: "/coach/mocks", label: "Mocks", hint: "Design and behavioral" },
  { href: "/me/stories", label: "Story bank", hint: "Your examples for behavioural rounds" },
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

const MODE_LINK = "flex items-center justify-between gap-4 border-t border-line px-4 py-3.5 first:border-0 hover:bg-surface-2";

function ModeLink({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <Link href={href} className={MODE_LINK}>
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold text-text">{label}</span>
        <span className="text-small text-mute">{hint}</span>
      </span>
      <span aria-hidden className="text-mute">
        →
      </span>
    </Link>
  );
}

// The weekly review is the last row, and only once there is one to read.
async function Recent({ userId, timezone, thread }: { userId: string; timezone: string; thread: Promise<Thread | null> }) {
  const [threads, current] = await Promise.all([listThreads(userId), thread]);
  return <ThreadList threads={threads} current={current?.id ?? null} timezone={timezone} />;
}

type PaneProps = {
  userId: string;
  thread: Promise<Thread | null>;
  t: string | undefined;
  kindParam: CoachKind | undefined;
  refParam: string | null;
  draft: string | undefined;
};

// The chat needs the thread, its messages and the model's health; the frame around it needs none of them.
async function ChatPane({ userId, thread: threadP, t, kindParam, refParam, draft }: PaneProps) {
  const thread = await threadP;
  const kind: CoachKind = thread?.kind ?? kindParam ?? "chat";
  const ref = thread ? thread.ref : refParam;
  // A new thread's id is picked here, so the first message creates it and later ones find it.
  const threadId = thread?.id ?? (isUuid(t) ? t : randomUUID());
  const [stored, degraded] = await Promise.all([thread ? threadMessages(userId, thread.id, 100) : Promise.resolve([]), coachDegraded()]);

  return (
    <>
      {kind === "mock" && ref && <MockThreadHeader userId={userId} mockId={ref} />}
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
    </>
  );
}

function ChatSkeleton() {
  return (
    <div
      className="flex min-h-96 animate-pulse flex-col gap-4 rounded-xl border border-line bg-surface p-6 motion-reduce:animate-none"
      aria-hidden="true"
    >
      <Bar w="w-40" h={16} />
      <Bar w="w-2/3" h={44} className="self-end rounded-2xl" />
      <Bar w="w-3/4" h={88} className="rounded-2xl" />
      <Bar w="w-full" h={56} className="mt-auto rounded-xl" />
    </div>
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
  // The digest row sits in the mode list above Recent: read it with the frame, so it never
  // lands late and pushes the list down. One small read, started first.
  const digestRead = latestWeekly(viewer.id);

  // Looked up now and awaited inside the list and the chat, so neither waits on the other.
  const thread = (async () => {
    const found = isUuid(t) ? await getThread(viewer.id, t) : null;
    if (!found && !t && kindParam && refParam) return findThread(viewer.id, kindParam, refParam);
    return found;
  })();
  // A thread is only ever found through `t` or the kind link, so this needs no lookup.
  const inThread = Boolean(t || kindParam || params.new);

  const digest = await digestRead;

  return (
    <>
      {/* Inside a chat on a phone, the chat gets the height; "All chats" leads back. */}
      <div className={inThread ? "hidden md:block" : undefined}>
        <PageHeader
          title="Coach"
          action={
            <Link href="/me/coach" className={button({ size: "sm" })}>
              What Coach knows
            </Link>
          }
        />
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] md:gap-8">
        <aside className={`${inThread ? "hidden md:flex" : "flex"} flex-col gap-6`}>
          <nav aria-label="Coach modes" className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
            {MODES.map((m) => (
              <ModeLink key={m.label} {...m} />
            ))}
            {digest && (
              <ModeLink href={`/me/weekly/${digest.id}`} label="Coach's weekly digest" hint={`Week of ${weekLabel(digest.weekStart)}`} />
            )}
          </nav>
          <Link href="/coach?new=1" className={`${button({ variant: "primary", size: "lg" })} md:hidden`}>
            New chat
          </Link>
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-heading font-semibold">Recent</h2>
            <Suspense fallback={<RowsSkeleton n={3} />}>
              <Recent userId={viewer.id} timezone={viewer.timezone} thread={thread} />
            </Suspense>
          </section>
        </aside>

        <section className={`${inThread ? "flex" : "hidden md:flex"} flex-col gap-3`}>
          <BackLink href="/coach" className="md:hidden">
            All chats
          </BackLink>
          <Suspense fallback={<ChatSkeleton />}>
            <ChatPane userId={viewer.id} thread={thread} t={t} kindParam={kindParam} refParam={refParam} draft={draft} />
          </Suspense>
        </section>
      </div>
    </>
  );
}
