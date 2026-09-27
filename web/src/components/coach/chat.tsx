"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { endThread } from "@/app/actions/coach";
import { button } from "@/components/button-styles";
import { Markdown } from "@/components/markdown";
import { citationsOf, toolLabel } from "@/lib/coach/chat-rules";
import { parseProposal } from "@/lib/coach/proposals";
import { ProposalCard } from "./proposal-card";

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
  const failed = state === "output-error" || (state === "output-available" && Boolean((output as { error?: unknown } | null)?.error));
  const phase = failed ? "error" : state === "output-available" ? "done" : "running";
  return <p className="text-small text-mute">{toolLabel(name, phase)}</p>;
}

function AssistantMessage({ message, threadId }: { message: UIMessage; threadId: string }) {
  const citations = citationsOf(message.parts);
  return (
    <div className="flex max-w-full flex-col gap-2 self-start md:max-w-5/6">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return part.text.trim() ? (
            <div key={i} className="rounded-2xl border border-line bg-surface-2 px-4 py-3">
              <Markdown>{part.text}</Markdown>
            </div>
          ) : null;
        }
        if (!isToolUIPart(part)) return null;
        const output = part.state === "output-available" ? part.output : undefined;
        const proposal = parseProposal(output);
        if (proposal) {
          return (
            <ProposalCard
              key={part.toolCallId}
              threadId={threadId}
              toolCallId={part.toolCallId}
              proposal={proposal.proposal}
              status={proposal.status}
            />
          );
        }
        return <ToolLine key={part.toolCallId} name={getToolName(part)} state={part.state} output={output} />;
      })}
      {citations.length > 0 && (
        <div className="flex flex-col gap-1.5 px-1">
          <span className="text-small text-mute">Sources</span>
          {citations.map((c) => (
            <a key={c.url} href={c.url} target="_blank" rel="noreferrer" className="text-small font-semibold text-cyan hover:underline">
              {c.title} ↗
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMessage({ message }: { message: UIMessage }) {
  const text = message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");
  return (
    <div className="max-w-5/6 self-end rounded-2xl border border-cyan/20 bg-cyan-bg px-4 py-3 whitespace-pre-wrap text-text">{text}</div>
  );
}

/** Three dots that keep moving while the coach works, so a long tool run never looks stuck. */
function Working() {
  return (
    <p className="flex items-center gap-2 text-small text-mute" role="status">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-mute"
            style={{ animation: `coach-dot 1.2s ${i * 0.16}s infinite ease-in-out` }}
          />
        ))}
      </span>
      Coach is working
    </p>
  );
}

/** The answer lives in this connection until it's saved, so leaving loses it. */
function KeepOpen() {
  return <p className="text-small text-mute">Keep the app open until the reply arrives. After that you can close it and pick up later.</p>;
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
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [busy]);

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
            className={`${button({ size: "sm" })} shrink-0`}
          >
            {ending ? "Ending…" : "End"}
          </button>
        )}
      </div>
      {degraded && <p className="text-small text-mute">Coach is on the lighter model until next month.</p>}

      <div className="flex flex-col gap-4" aria-live="polite">
        {messages.map((m) =>
          m.role === "user" ? <UserMessage key={m.id} message={m} /> : <AssistantMessage key={m.id} message={m} threadId={threadId} />,
        )}
        {busy && <Working />}
        {busy && slow && <KeepOpen />}
        {cutOff && <p className="text-small text-warn">Coach stopped before answering. Ask again.</p>}
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
          <button type="button" onClick={() => void stop()} className={`${button()} shrink-0`}>
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
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
