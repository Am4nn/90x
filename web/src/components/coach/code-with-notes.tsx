import type { Review } from "@/lib/coach/review-rules";

/** The user's code with line numbers; each line note sits under its line, the rest above the code. */
export function CodeWithNotes({ code, notes }: { code: string; notes: Review["lineNotes"] }) {
  const lines = code.split("\n");
  const width = String(lines.length).length;
  const general = notes.filter((n) => !n.line);
  const notesAt = (line: number) => notes.filter((n) => n.line === line);
  return (
    <div className="flex flex-col gap-3">
      {general.length > 0 && (
        <ul className="flex flex-col gap-2">
          {general.map((n, i) => (
            <li key={i} className="rounded-xl border border-line bg-surface px-4 py-3 text-small text-text-2">
              {n.note}
            </li>
          ))}
        </ul>
      )}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface py-3">
        <div className="w-max min-w-full font-mono text-small leading-relaxed">
          {lines.map((text, i) => (
            <div key={i}>
              <div className="flex">
                <span aria-hidden className="shrink-0 px-3 text-right text-mute select-none" style={{ width: `${width + 2}ch` }}>
                  {i + 1}
                </span>
                <span className="pr-4 whitespace-pre text-text">{text || " "}</span>
              </div>
              {notesAt(i + 1).map((n, j) => (
                <p key={j} className="my-1 mr-3 ml-3 max-w-prose border-l-2 border-cyan bg-cyan-bg px-3 py-2 font-sans text-text-2">
                  <span className="sr-only">Line {i + 1}: </span>
                  {n.note}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
