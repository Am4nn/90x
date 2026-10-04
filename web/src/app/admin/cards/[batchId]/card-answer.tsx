import type { ReviewCard } from "@/lib/admin/cards";

// Static render of a card's options and answer definition, for the admin review
// screen. The reader answers the options; the answer definition is what a pure
// function marks the answer against. Showing both, in the same vocabulary the
// Feed primitives use, lets a reviewer judge whether the card is answerable and
// whether its archetype earns a place.

const letter = (i: number) => String.fromCharCode(65 + i);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-tag text-mute">{label}</span>
      <div className="text-body text-text-2">{children}</div>
    </div>
  );
}

/** The card's options, in the shape its primitive renders. */
export function OptionsView({ card }: { card: ReviewCard }) {
  const options = card.options;
  if (!options) return null;

  switch (options.shape) {
    case "list":
      return (
        <ol className="flex list-[upper-alpha] flex-col gap-1.5 pl-5 text-text-2">
          {options.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case "match":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Row label="Left">
            {options.left.map((item, i) => (
              <div key={i}>{item}</div>
            ))}
          </Row>
          <Row label="Right">
            {options.right.map((item, i) => (
              <div key={i}>{item}</div>
            ))}
          </Row>
        </div>
      );
    case "bucket":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Row label="Items">
            {options.items.map((item, i) => (
              <div key={i}>{item}</div>
            ))}
          </Row>
          <Row label="Columns">
            {options.columns.map((column, i) => (
              <div key={i}>{column}</div>
            ))}
          </Row>
        </div>
      );
    case "assemble":
      return (
        <div className="flex flex-wrap items-center gap-2">
          {options.tokens.map((token, i) => {
            const fixed = options.fixed[i] ?? null;
            return (
              <span
                key={i}
                className={
                  fixed !== null
                    ? "rounded-lg border border-line-2 bg-surface-2 px-2.5 py-1 text-body text-text-2"
                    : "rounded-lg border border-dashed border-line px-2.5 py-1 text-body text-mute"
                }
              >
                {token}
              </span>
            );
          })}
        </div>
      );
    case "grid":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Row label="Rows">
            {options.rows.map((row, i) => (
              <div key={i}>{row}</div>
            ))}
          </Row>
          <Row label="Columns">
            {options.columns.map((column, i) => (
              <div key={i}>{column}</div>
            ))}
          </Row>
        </div>
      );
  }
}

const text = (index: number | undefined, items: string[] | undefined): string => {
  const value = index !== undefined && items && index >= 0 && index < items.length ? items[index] : undefined;
  return value ?? String(index ?? "");
};

/** The answer the reader is graded against, in the primitive's vocabulary. */
export function AnswerDefinition({ card }: { card: ReviewCard }) {
  const content = definitionContent(card);
  if (!content) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-tag text-mute uppercase">Correct answer</span>
      <div className="text-body text-text-2">{content}</div>
    </div>
  );
}

function definitionContent(card: ReviewCard): React.ReactNode {
  const options = card.options;

  switch (card.primitive) {
    case "pick_one":
      return (
        <>
          {letter(card.picked?.[0] ?? 0)}. {text(card.picked?.[0], options?.shape === "list" ? options.items : undefined)}
        </>
      );
    case "tap_in_place":
      return (
        <>
          Line {(card.picked?.[0] ?? 0) + 1} — {text(card.picked?.[0], options?.shape === "list" ? options.items : undefined)}
        </>
      );
    case "grid_toggle": {
      const rows = options?.shape === "grid" ? options.rows : [];
      const columns = options?.shape === "grid" ? options.columns : [];
      const cells = (card.picked ?? []).map((cell) => {
        if (!columns.length) return String(cell);
        const row = Math.floor(cell / columns.length);
        const column = cell % columns.length;
        return `${text(row, rows)} · ${text(column, columns)}`;
      });
      return <>Ticked: {cells.length ? cells.join(", ") : "none"}</>;
    }
    case "order": {
      const items = options?.shape === "list" ? options.items : undefined;
      const parts = (card.constraints ?? []).map(([before, after]) => `${text(before, items)} → ${text(after, items)}`);
      return <>before: {parts.length ? parts.join(" · ") : "none"}</>;
    }
    case "assemble": {
      const tokens = options?.shape === "assemble" ? options.tokens : undefined;
      const parts = (card.constraints ?? []).map(([before, after]) => `${text(before, tokens)} → ${text(after, tokens)}`);
      return <>before: {parts.length ? parts.join(" · ") : "none"}</>;
    }
    case "match": {
      const left = options?.shape === "match" ? options.left : undefined;
      const right = options?.shape === "match" ? options.right : undefined;
      const parts = (card.pairs ?? []).map(([l, r]) => `${text(l, left)} ↔ ${text(r, right)}`);
      return <>{parts.join(" · ")}</>;
    }
    case "bucket": {
      const items = options?.shape === "bucket" ? options.items : undefined;
      const columns = options?.shape === "bucket" ? options.columns : undefined;
      const parts = (card.pairs ?? []).map(([item, column]) => `${text(item, items)} → ${text(column, columns)}`);
      return <>{parts.join(" · ")}</>;
    }
    case "claim_grid": {
      const items = options?.shape === "list" ? options.items : undefined;
      const parts = (card.pairs ?? []).map(([statement, truth]) => `${text(statement, items)} → ${truth === 1 ? "true" : "false"}`);
      return <>{parts.join(" · ")}</>;
    }
    case "numeric":
      if (card.value === null || card.tolerance === null) return null;
      return (
        <>
          <span className="tabular">{card.value}</span> ± <span className="tabular">{card.tolerance}</span>
        </>
      );
    case "compose":
      // A written answer has no answer-shape column: the key points are what it
      // is marked against, one boolean each. The reviewer has to see them, and
      // has to read them as the answer definition rather than as notes — a
      // requirement nobody could meet in three sentences marks a good answer
      // wrong, which is this screen's version of an implausible distractor.
      return (
        <>
          Marked against each, by a model:{" "}
          {card.keyPoints.length ? card.keyPoints.map((point, i) => `${i + 1}. ${point}`).join(" ") : "no rubric"}
        </>
      );
    default:
      // compose and legacy cards carry no answer definition.
      return null;
  }
}

/** The why-step: every reason, with the correct one marked, so the reviewer can
 *  judge whether the wrong reasons are genuinely plausible. A right answer with
 *  a wrong reason is marked wrong, so an implausible distractor punishes the
 *  reader for a writing failure. */
export function WhyStepView({ card }: { card: ReviewCard }) {
  const why = card.whyStep;
  if (!why) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-tag text-mute">Why (answer and reason must both be right)</span>
      <ol className="flex flex-col gap-1">
        {why.options.map((reason, i) => (
          <li
            key={i}
            className={`flex items-baseline gap-2 text-body ${
              i === why.correct ? "border border-cyan bg-cyan-bg px-2 py-1 font-semibold text-text" : "text-text-2"
            }`}
          >
            <span className="text-mute">{letter(i)}.</span>
            <span>{reason}</span>
            {i === why.correct && <span className="text-small text-cyan">correct</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
