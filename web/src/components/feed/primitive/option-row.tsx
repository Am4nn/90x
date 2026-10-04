import { MarkLine } from "./marks";

export type RowTone = "idle" | "sel" | "ok" | "bad" | "dim";

/** The border and ink a row or tile takes in each state, shared by the answer rows and the reason tiles. */
export const ROW_TONE: Record<RowTone, string> = {
  idle: "border-line-2 bg-surface text-text",
  sel: "border-cyan bg-cyan-bg text-text",
  ok: "border-ok bg-surface text-text",
  bad: "border-bad bg-surface text-text",
  dim: "border-line text-mute",
};

/** One lettered answer row, as the question draws it and as the result marks it. */
export function OptionRow({
  letter,
  tone,
  mark,
  children,
}: {
  letter: string;
  tone: RowTone;
  mark: "Correct" | "You chose" | null;
  children: React.ReactNode;
}) {
  return (
    <li className={`flex min-h-12 items-start gap-3 rounded-lg border px-3.5 py-3 text-body ${ROW_TONE[tone]}`}>
      <span
        aria-hidden
        className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full border border-line-2 font-sans text-tag font-bold text-text-2"
      >
        {letter}
      </span>
      <span className="flex min-w-0 flex-col gap-2">
        <span className="text-pretty">{children}</span>
        {mark && <MarkLine ok={mark === "Correct"}>{mark}</MarkLine>}
      </span>
    </li>
  );
}
