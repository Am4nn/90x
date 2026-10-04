import { Eyebrow } from "./hint";
import { MarkLine } from "./marks";

/** compose: what the reader wrote, then each point the answer had to cover marked covered or missed.
 *  Without a mark (they asked to be shown it) the points stand alone. */
export function ComposeReview({ written, rubric, hits }: { written: string | null; rubric: string[]; hits: boolean[] | null }) {
  return (
    <div className="flex flex-col gap-3">
      {written && <p className="rounded-lg bg-surface-2 px-3.5 py-3 text-body text-pretty text-text-2">{written}</p>}
      {hits ? (
        <ul className="flex flex-col gap-2" aria-label="What it had to cover">
          {rubric.map((point, index) => {
            const hit = hits[index] === true;
            return (
              <li key={point} className={`flex flex-col gap-2 rounded-lg border px-3.5 py-3 ${hit ? "border-ok" : "border-bad"}`}>
                <span className="text-body leading-code text-pretty text-text">{point}</span>
                <span role="img" aria-label={hit ? "Covered" : "Missed"}>
                  <MarkLine ok={hit}>{hit ? "Covered" : "Missed"}</MarkLine>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col gap-2">
          <Eyebrow>What it had to cover</Eyebrow>
          <ul className="flex flex-col gap-2">
            {rubric.map((point) => (
              <li key={point} className="border-l border-line-2 pl-3 text-body leading-code text-pretty text-text">
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
