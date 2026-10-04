"use client";

import { useState } from "react";
import { CheckBar } from "./check-bar";
import { Hint } from "./hint";
import { OptionRow } from "./option-row";
import { ReasonList } from "./reason-list";

/** The why-step: a second question on the same card, asked only after a correct main
 *  answer. The options stay on screen with the reader's pick marked, and the reasons
 *  open beneath them. Both halves must be right, or the card is marked wrong. */
export function WhyStep({
  items,
  chosen,
  reasons,
  pending,
  busy,
  onSubmit,
}: {
  items: string[];
  chosen: number | null;
  reasons: string[];
  pending: boolean;
  busy: string | null;
  onSubmit: (why: number) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-5">
      <Hint>Right. Now pick the reason; the card counts only if both are right.</Hint>
      <div className="flex flex-col gap-2">
        <ul className="flex flex-col gap-2" aria-label="Your answer">
          {items.map((item, index) => (
            <OptionRow
              key={index}
              letter={String.fromCharCode(65 + index)}
              tone={index === chosen ? "ok" : "dim"}
              mark={index === chosen ? "Correct" : null}
            >
              {item}
            </OptionRow>
          ))}
        </ul>
        <ReasonList reasons={reasons} tone={(index) => (index === picked ? "sel" : "idle")} onPick={pending ? undefined : setPicked} />
      </div>
      <CheckBar
        pending={pending}
        busy={busy}
        complete={picked !== null}
        label="Check reason"
        onCheck={() => picked !== null && onSubmit(picked)}
      />
    </div>
  );
}
