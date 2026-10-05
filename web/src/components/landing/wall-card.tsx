import type { WallCard as Card, WallRow, WallTone, WallTopic } from "@/lib/landing/wall-cards";

// One sample card on the Feed wall, drawn the way the Feed draws it after an answer:
// the question, the rows marked right or wrong, and the verdict.

const TOPIC_DOT: Record<WallTopic, string> = {
  sql: "bg-topic-sql",
  dsa: "bg-topic-dsa",
  cs: "bg-topic-cs",
  beh: "bg-topic-beh",
  sd: "bg-topic-sd",
};
const ROW: Record<WallTone, string> = {
  ok: "border-ok-deep bg-ok/6",
  bad: "border-bad-deep bg-bad/6",
  plain: "border-transparent",
};
const LABEL: Record<WallTone, string> = { ok: "text-ok", bad: "text-bad", plain: "text-mute" };

/** A tick or a cross, drawn rather than typed: the mono face does not have them. */
function Mark({ kind }: { kind: "tick" | "cross" }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="size-3 translate-y-px">
      <path
        d={kind === "tick" ? "M2 6.4l2.6 2.6L10 3.4" : "M3 3l6 6M9 3l-6 6"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Row({ row }: { row: WallRow }) {
  const text = row.code ? "font-term text-tag leading-code font-medium" : "text-small leading-chip font-semibold";
  return (
    <div className={`flex items-baseline gap-2.5 rounded-sm border px-2 py-1.5 ${ROW[row.tone]}`}>
      {row.label && (
        <span className={`min-w-4 flex-none font-term text-tag leading-chip font-bold ${LABEL[row.tone]}`}>
          {row.label === "tick" || row.label === "cross" ? <Mark kind={row.label} /> : row.label}
        </span>
      )}
      {row.cells ? (
        <span className={`grid min-w-0 flex-1 grid-cols-3 gap-2 text-text-2 ${text}`}>
          {row.cells.map((cell) => (
            <span key={cell}>{cell}</span>
          ))}
        </span>
      ) : (
        <span className={`min-w-0 flex-1 whitespace-pre-wrap text-text-2 ${text}`}>{row.text}</span>
      )}
    </div>
  );
}

export function WallCard({ card }: { card: Card }) {
  return (
    <div className="flex w-66 flex-none flex-col gap-3 rounded-xl border border-line bg-surface p-4 @wide:w-full">
      <div className="flex items-center gap-2 text-meta font-bold text-mute">
        <span className={`size-1.5 rounded-full ${TOPIC_DOT[card.topic]}`} />
        {card.topicName}
        <span className="flex-1" />
        {card.kind}
      </div>
      <span className="font-display text-wall font-semibold">{card.prompt}</span>
      {card.big && <span className="font-display text-numeral font-bold text-ok">{card.big}</span>}
      {card.rows.length > 0 && (
        <div className="flex flex-col gap-1">
          {card.rows.map((row) => (
            <Row key={`${row.label}${row.text}${row.cells?.join("")}`} row={row} />
          ))}
        </div>
      )}
      <span
        data-tone={card.verdictTone}
        className={`flex h-6 items-center self-start rounded-full border border-current px-2.5 text-tag font-bold ${card.verdictTone === "ok" ? "text-ok" : "text-bad"}`}
      >
        {card.verdict}
      </span>
    </div>
  );
}
