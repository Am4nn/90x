"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isTextUIPart, isToolUIPart, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { endThread } from "@/app/actions/coach";
import { button } from "@/components/button-styles";
import { Busy } from "@/components/form";
import { Markdown } from "@/components/markdown";
import { citationsOf, toolFailed, toolLabel, toolLimited, workingSummary, type WorkingSummary } from "@/lib/coach/chat-rules";
import { parseProposal } from "@/lib/coach/proposals";
import { ProposalCard } from "./proposal-card";
import { Ren } from "./ren";

const STARTERS = ["What should I focus on this week?", "Why am I weak at sliding window?", "Plan my next 3 days"];
const RATE_LIMIT_PAUSE_MS = 60_000;

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

const statusOf = (error: Error | undefined) => (error as { statusCode?: number } | undefined)?.statusCode;

function ToolLine({ name, state, output }: { name: string; state: string; output: unknown }) {
  const failed = toolFailed(state, output);
  const limited = toolLimited(state, output);
  const phase = failed ? "error" : limited ? "limited" : state === "output-available" ? "done" : "running";
  return <p className="text-small text-mute">{toolLabel(name, phase)}</p>;
}

/** The one spinner every working state shares, so the coach never shows two at once. */
function Spinner() {
  return (
    <span
      aria-hidden
      className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-mute border-t-transparent motion-reduce:animate-none"
    />
  );
}

/** One quiet line while the coach works: the current activity plus progress. */
function WorkingLine({ summary }: { summary: WorkingSummary }) {
  return (
    <p className="flex items-center gap-2 text-small text-mute">
      <Spinner />
      <span>
        {summary.label}
        {summary.total > 1 && ` · ${summary.done} of ${summary.total} checks done`}
      </span>
    </p>
  );
}

/** The collapsed "Checked N things" line that expands to the tool steps. */
function CheckedThings({ summary, parts }: { summary: WorkingSummary; parts: UIMessage["parts"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-left text-small text-mute hover:text-text"
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        <span>
          Checked {summary.total} {summary.total === 1 ? "thing" : "things"}
          {summary.failed > 0 && <span className="text-warn"> · {summary.failed} couldn&apos;t be checked</span>}
          {summary.limited > 0 && <span> · {summary.limited} at the tool limit</span>}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 pl-4">
          {parts.map((part) => {
            if (!isToolUIPart(part)) return null;
            const output = part.state === "output-available" ? part.output : undefined;
            return <ToolLine key={part.toolCallId} name={getToolName(part)} state={part.state} output={output} />;
          })}
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ message, threadId, streaming }: { message: UIMessage; threadId: string; streaming: boolean }) {
  const citations = citationsOf(message.parts);
  const summary = workingSummary(message.parts);
  // The model can return several text parts; they are one reply, one bubble.
  const text = message.parts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .filter((t) => t.trim() !== "")
    .join("\n\n");
  const toolParts = message.parts.filter(isToolUIPart);
  const proposalParts = toolParts.filter((p) => parseProposal(p.state === "output-available" ? p.output : undefined));
  const steps = toolParts.filter((p) => !parseProposal(p.state === "output-available" ? p.output : undefined));
  return (
    <div className="flex max-w-full items-start gap-2 self-start md:max-w-5/6">
      <Ren title="Ren, your coach" className="mt-1 size-7 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {text && (
          <div className="rounded-2xl bg-surface-2 px-4 py-3 [&>div>p:first-child]:font-semibold [&>div>p:first-child]:text-text">
            <Markdown>{text}</Markdown>
          </div>
        )}
        {proposalParts.map((part) => {
          const proposal = parseProposal(part.state === "output-available" ? part.output : undefined);
          if (!proposal) return null;
          return (
            <ProposalCard
              key={part.toolCallId}
              threadId={threadId}
              toolCallId={part.toolCallId}
              proposal={proposal.proposal}
              status={proposal.status}
            />
          );
        })}
        {summary && streaming && summary.label && <WorkingLine summary={summary} />}
        {summary && !streaming && <CheckedThings summary={summary} parts={steps} />}
        {citations.length > 0 &&
          citations.map((c) => (
            <a key={c.url} href={c.url} target="_blank" rel="noreferrer" className="text-small font-semibold text-cyan hover:underline">
              {c.title} ↗
            </a>
          ))}
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: UIMessage }) {
  const text = message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");
  return (
    <div className="max-w-5/6 self-end rounded-2xl border border-cyan/20 bg-cyan-bg px-4 py-3 whitespace-pre-wrap text-text">{text}</div>
  );
}

/** A quiet line while the coach works, before any tool runs: a spinner, not the
 *  three bouncing dots that used to double up with the tool working line. */
function Working() {
  return (
    <p className="flex items-center gap-2 text-small text-mute" role="status">
      <Spinner />
      Coach is working
    </p>
  );
}

/** Shown once an answer is taking a while, to say that leaving is safe. */
function KeepOpen() {
  // It used to say "keep the app open", because closing it aborted the run and
  // lost the answer. The run now finishes on the server either way. Indented to
  // sit under the coach's reply rather than read as part of it.
  return <p className="pl-9 text-small text-mute">You can close the app — the reply will be here when you come back.</p>;
}

/** One coach thread: messages, tool activity, proposals, and the composer. */
export function CoachChat({
  threadId,
  kind,
  refValue,
  title,
  initialMessages,
  ended: endedAtStart,
  degraded,
  draft,
  starters = STARTERS,
}: {
  threadId: string;
  kind: string;
  refValue: string | null;
  title: string;
  initialMessages: UIMessage[];
  ended: boolean;
  degraded: boolean;
  draft?: string;
  starters?: readonly string[];
}) {
  const router = useRouter();
  const online = useOnline();
  const [input, setInput] = useState(draft ?? "");
  const [pausedUntil, setPausedUntil] = useState(0);
  const [ended, setEnded] = useState(endedAtStart);
  const [endNote, setEndNote] = useState<string | null>(null);
  const [ending, startEnding] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/coach/chat",
        // Only the new message goes up; the server keeps the history.
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { threadId, kind, ref: refValue ?? undefined, message: messages.at(-1) },
        }),
      }),
  );
  const { messages, sendMessage, status, stop, error, clearError } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onFinish: () => router.refresh(),
    onError: (e) => {
      if (statusOf(e) === 429) setPausedUntil(Date.now() + RATE_LIMIT_PAUSE_MS);
    },
  });

  const paused = pausedUntil > 0;
  useEffect(() => {
    if (!pausedUntil) return;
    const timer = setTimeout(() => setPausedUntil(0), Math.max(0, pausedUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [pausedUntil]);

  // Follow the conversation when a message is added.
  const count = messages.length;
  useEffect(() => {
    if (count) bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);

  const busy = status === "submitted" || status === "streaming";
  const blocked = !online || paused;

  // Only warn about leaving once an answer is actually taking a while.
  const [slow, setSlow] = useState(false);
  const [stopFailed, setStopFailed] = useState(false);
  // Which attempt a pending stop belongs to. Sending a new message moves this on,
  // so a stop request that fails after the reader has carried on cannot put its
  // warning against the wrong reply.
  const attempt = useRef(0);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [busy]);

  // Stop has to say so out of band. Generation no longer follows the connection -
  // that is what lets a reader close the app and come back to a finished answer -
  // so dropping it is no longer a cancellation. Without this the model would keep
  // going and save a reply the reader had just said they did not want.
  const halt = async () => {
    const mine = ++attempt.current;
    await stop();
    setStopFailed(false);
    const failed = await fetch("/api/coach/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId }),
      keepalive: true,
    }).then(
      // Reaching the server is what stops the model. If that did not happen the
      // reply carries on and is saved, and the reader is entitled to know rather
      // than watch an answer they cancelled appear anyway.
      (response) => !response.ok,
      () => true,
    );
    if (failed && attempt.current === mine) setStopFailed(true);
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy || blocked) return;
    if (!messages.length) {
      // Keep the new thread in the URL so a reload or a refresh finds it.
      const params = new URLSearchParams({ t: threadId });
      if (kind !== "chat") params.set("kind", kind);
      if (refValue) params.set("ref", refValue);
      window.history.replaceState(null, "", `/coach?${params}`);
    }
    clearError();
    setSlow(false);
    setStopFailed(false);
    attempt.current += 1;
    void sendMessage({ text: trimmed });
    setInput("");
  };

  const end = () =>
    startEnding(async () => {
      try {
        const result = await endThread(threadId);
        if (result.error) setEndNote(result.error);
        else {
          setEnded(true);
          setEndNote(result.note ?? null);
        }
      } catch {
        setEndNote("That didn't go through. Try again.");
      }
    });

  const errorText =
    error && (statusOf(error) ?? 0) >= 400 && error.message.length < 200
      ? error.message
      : error
        ? "Coach couldn't answer just now. Try again."
        : null;

  // A connection dropped mid-answer leaves the last turn with tool lines and no
  // reply, and useChat reports no error for it. Say so instead of looking stuck.
  const last = messages.at(-1);
  const cutOff = !busy && !errorText && last?.role === "assistant" && !last.parts.some((p) => p.type === "text" && p.text.trim());

  // One working indicator only. While a tool runs, the last assistant message's
  // working line carries the spinner; before any tool and once they are done, the
  // quiet "Coach is working" line does. The two must never share the screen.
  const lastSummary = last?.role === "assistant" ? workingSummary(last.parts) : null;
  const toolRunning = Boolean(lastSummary?.label);

  return (
    <div className="flex min-h-96 flex-1 flex-col gap-4 rounded-xl border border-line bg-surface p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate font-display text-heading font-semibold">{title}</h2>
        {messages.length > 0 && !ended && !busy && (
          <button
            type="button"
            onClick={end}
            disabled={ending}
            aria-busy={ending || undefined}
            className="inline-flex shrink-0 items-center gap-1.5 text-small font-semibold text-mute hover:text-text"
          >
            <Busy busy={ending}>{ending ? "Ending…" : "End chat"}</Busy>
          </button>
        )}
      </div>
      {degraded && <p className="text-small text-mute">Coach is on the lighter model until next month.</p>}

      <div className="flex flex-col gap-4" aria-live="polite">
        {messages.map((m) =>
          m.role === "user" ? (
            <UserMessage key={m.id} message={m} />
          ) : (
            <AssistantMessage key={m.id} message={m} threadId={threadId} streaming={busy && m.id === last?.id} />
          ),
        )}
        {busy && !toolRunning && <Working />}
        {busy && slow && <KeepOpen />}
        {cutOff && <p className="text-small text-warn">Coach stopped before answering. Ask again.</p>}
        {stopFailed && (
          <p className="text-small text-warn">Couldn&apos;t reach the server to stop that. The reply may still finish and appear here.</p>
        )}
        {endNote && <p className="text-small text-mute">{endNote}</p>}
        {errorText && (
          <p role="alert" className="text-small text-bad">
            {errorText}
          </p>
        )}
        <div ref={bottom} />
      </div>

      {!messages.length && (
        <div className="flex flex-wrap gap-2">
          {starters.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={blocked}
              className="rounded-full border border-line-2 px-4 py-2 text-left text-small font-semibold text-text-2 hover:border-mute hover:text-text disabled:opacity-60"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="sticky bottom-24 mt-auto flex items-end gap-2.5 rounded-xl border border-line-2 bg-surface py-2 pr-2 pl-4 focus-within:border-cyan md:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={Math.min(6, Math.max(1, input.split("\n").length))}
          maxLength={8000}
          disabled={blocked}
          aria-label="Message Coach"
          placeholder={!online ? "You're offline" : paused ? "Take a short break, then try again" : "Ask the coach"}
          className="max-h-48 min-h-10 flex-1 resize-none bg-transparent py-2 text-text outline-none placeholder:text-mute disabled:opacity-60"
        />
        {busy ? (
          <button type="button" onClick={() => void halt()} className={`${button()} shrink-0`}>
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={blocked || !input.trim()}
            aria-label="Send"
            className={`${button({ variant: "primary", size: "icon" })} shrink-0`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M4 12l16-8-6 16-3-6z" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
