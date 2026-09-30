"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";
import { startMockAction } from "@/app/actions/mocks";
import { button } from "@/components/button-styles";
import { ChipGroup } from "@/components/chip-group";
import { EmptyState } from "@/components/empty-state";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { Section } from "@/components/section";
import { BEHAVIORAL_QUESTIONS } from "@/lib/coach/mock-rules";
import { searchTopics, topicLabel } from "@/lib/coach/topic-search";

const STORY_BANK = "/me/stories";
// Every design topic is a system-design topic (designTopics filters the domain).
const AREA_LABEL = "System design";
const CARD_CLASS = "flex flex-col gap-4 rounded-xl border border-line bg-surface p-5";

/** Bolds the typed substring in a label, the dropdown's matched-text highlight. */
function Highlight({ label, query }: { label: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{label}</>;
  const idx = label.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, idx)}
      <b className="text-cyan">{label.slice(idx, idx + q.length)}</b>
      {label.slice(idx + q.length)}
    </>
  );
}

/** Search box with a listbox of topics. The hidden `topic` field always holds the raw
 *  name, because the server refuses anything that is not in designTopics(). */
function TopicCombobox({ topics, first }: { topics: string[]; first: string }) {
  const id = useId();
  const [value, setValue] = useState(first);
  const [text, setText] = useState(topicLabel(first));
  const [typed, setTyped] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Opening an untouched box shows every topic, so it can be browsed as well as searched.
  const matches = searchTopics(topics, typed ? text : "");
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-option-${i}`;
  const expanded = open && matches.length > 0;

  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id]);

  function close() {
    setOpen(false);
    setActive(-1);
    setTyped(false);
    setText(topicLabel(value));
  }

  function choose(topic: string) {
    setValue(topic);
    setText(topicLabel(topic));
    setTyped(false);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!matches.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      setActive(!expanded || active < 0 ? (step === 1 ? 0 : matches.length - 1) : (active + step + matches.length) % matches.length);
    } else if (e.key === "Enter" && expanded) {
      // An open list means Enter picks; a closed one lets Enter submit the form.
      e.preventDefault();
      const pick = matches[active >= 0 ? active : 0];
      if (pick) choose(pick);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <input type="hidden" name="topic" value={value} />
      <div
        className="relative"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) close();
        }}
      >
        <div className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-line-2 bg-background px-3 text-text focus-within:border-cyan">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-mute"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M16 16l4 4" />
          </svg>
          <input
            id={`${id}-input`}
            type="text"
            role="combobox"
            aria-label="Problem"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
            autoComplete="off"
            placeholder="Search topics"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTyped(true);
              setOpen(true);
              setActive(-1);
            }}
            onClick={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className="h-full w-full bg-transparent text-text outline-none placeholder:text-mute"
          />
          <span className="shrink-0 text-mute" aria-hidden>
            ▾
          </span>
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label="Matching topics"
          hidden={!expanded}
          className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line-2 bg-surface p-1"
        >
          {matches.map((t, i) => (
            <div
              key={t}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              // Keep focus in the input, or the blur handler closes the list before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              tabIndex={-1}
              onClick={() => choose(t)}
              onKeyDown={(e) => e.key === "Enter" && choose(t)}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-body ${
                i === active ? "bg-cyan-bg text-cyan" : t === value ? "text-cyan" : "text-text hover:bg-surface-2"
              }`}
            >
              <span>
                <Highlight label={topicLabel(t)} query={typed ? text : ""} />
              </span>
              <span className="shrink-0 text-small text-mute">{AREA_LABEL}</span>
            </div>
          ))}
        </div>
      </div>
      <p role="status" className={open && !matches.length ? "text-small text-mute" : "sr-only"}>
        {!open
          ? ""
          : matches.length
            ? `${matches.length} ${matches.length === 1 ? "topic" : "topics"}`
            : "No topics match. Try a shorter search."}
      </p>
    </div>
  );
}

export function DesignMockForm({ topics }: { topics: string[] }) {
  const [state, action] = useActionState<FormState, FormData>(startMockAction, {});
  const first = topics[0];
  return (
    <Section className={CARD_CLASS} title="Design mock" hint="Search a topic; Coach runs a timed text interview.">
      {first ? (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="type" value="design" />
          <TopicCombobox topics={topics} first={first} />
          <FormMessage state={state} />
          <SubmitButton pendingLabel="Starting…">Start design mock</SubmitButton>
        </form>
      ) : (
        <EmptyState title="No design topics yet">System design topics appear once the content is published.</EmptyState>
      )}
    </Section>
  );
}

export function BehavioralMockForm({ stories }: { stories: number }) {
  const [state, action] = useActionState<FormState, FormData>(startMockAction, {});
  return (
    <Section
      className={CARD_CLASS}
      title="Behavioural mock"
      hint={stories ? "Uses your 6 STAR stories. Coach asks, you answer in text." : undefined}
    >
      {stories ? (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="type" value="behavioral" />
          <ChipGroup
            name="topic"
            label="Question"
            options={BEHAVIORAL_QUESTIONS.map((q) => ({ value: q, label: q.replace(/^Tell me about /, "").replace(/\.$/, "") }))}
            defaultValue={BEHAVIORAL_QUESTIONS[0]}
          />
          <FormMessage state={state} />
          <SubmitButton className={button({ variant: "secondary", size: "lg" })} pendingLabel="Starting…">
            Start behavioural mock
          </SubmitButton>
          <Link href={STORY_BANK} className="self-start text-small font-semibold text-cyan">
            Manage your story bank
          </Link>
        </form>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-background p-5">
          <span className="font-bold">Add a story first</span>
          <p className="text-small text-mute">
            Behavioural questions ask for your own examples, so a mock has nothing to ask without at least one STAR story. Add one and come
            back — it takes two minutes.
          </p>
          <Link href={STORY_BANK} className={`${button({ variant: "secondary", size: "sm" })} self-start`}>
            Open Story bank
          </Link>
        </div>
      )}
    </Section>
  );
}
