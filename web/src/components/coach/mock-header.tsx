"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { endMockAction } from "@/app/actions/mocks";
import { button } from "@/components/button-styles";
import { useServerAction } from "@/components/form";
import { type MockType, STAGES, stageAt } from "@/lib/coach/mock-rules";

// Slim header on a mock thread: stage and countdown from started_at, and an
// End button. When the clock runs out it ends and scores the mock by itself.

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
const second = () => Math.floor(Date.now() / 1000);
// No clock on the server, so the first client render matches the HTML.
const noClock = () => null;

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function MockHeader({
  mockId,
  type,
  topic,
  startedAt,
  running,
}: {
  mockId: string;
  type: MockType;
  topic: string;
  startedAt: string;
  running: boolean;
}) {
  const router = useRouter();
  const now = useSyncExternalStore(subscribe, second, noClock);
  const { run, pending, error } = useServerAction();
  const autoEnded = useRef(false);
  const at = now == null ? null : stageAt(type, startedAt, new Date(now * 1000));
  const over = running && at?.over === true;

  const end = () =>
    run(async () => {
      const result = await endMockAction(mockId);
      if (!result.error) router.push(`/coach/mocks/${mockId}`);
      return result;
    });

  useEffect(() => {
    if (over && !autoEnded.current) {
      autoEnded.current = true;
      end();
    }
  });

  const stages = STAGES[type];
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{topic}</div>
          <div className="text-small text-mute">
            {type === "design" ? "Design mock" : "Behavioral mock"}
            {running && at ? ` · ${at.stage.label} (${at.index + 1} of ${stages.length})` : ""}
            {!running && " · ended"}
          </div>
        </div>
        {running ? (
          <div className="flex shrink-0 items-center gap-3">
            <span className={`tabular font-display text-heading font-semibold ${at && at.leftMs < 5 * 60_000 ? "text-warn" : "text-text"}`}>
              {at ? clock(at.leftMs) : "--:--"}
            </span>
            <button type="button" onClick={end} disabled={pending} aria-busy={pending || undefined} className={button({ size: "sm" })}>
              {pending ? "Scoring…" : "End"}
            </button>
          </div>
        ) : (
          <Link href={`/coach/mocks/${mockId}`} className="shrink-0 text-small font-semibold text-cyan">
            See score
          </Link>
        )}
      </div>
      {running && at && (
        <div className="flex gap-1" aria-hidden>
          {stages.map((s, i) => (
            <span
              key={s.key}
              className={`h-1 rounded-full ${i < at.index ? "bg-cyan" : i === at.index ? "bg-cyan opacity-60" : "bg-surface-2"}`}
              style={{ flexGrow: s.minutes }}
            />
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
