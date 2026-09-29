"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";
import { startMockAction } from "@/app/actions/mocks";
import { PRIMARY } from "@/components/button-styles";
import { ChipGroup } from "@/components/chip-group";
import { EmptyState } from "@/components/empty-state";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { BEHAVIORAL_QUESTIONS, mockMinutes } from "@/lib/coach/mock-rules";
import { searchTopics, topicLabel } from "@/lib/coach/topic-search";

const STORY_BANK = "/me/stories";
const FIELD = "h-11 w-full rounded-xl border border-line-2 bg-surface px-3 text-text outline-none placeholder:text-mute focus:border-cyan";

function Card({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div>
        <h2 className="font-display text-heading font-semibold">{title}</h2>
        <p className="text-small text-mute">{hint}</p>
      </div>
      {children}
    </section>
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
      <label htmlFor={`${id}-input`} className="text-small font-semibold text-text-2">
        Problem
      </label>
      <div
        className="relative"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) close();
        }}
      >
        <input
          id={`${id}-input`}
          type="text"
          role="combobox"
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
          className={FIELD}
        />
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
              className={`flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-body ${
                i === active ? "bg-cyan-bg text-cyan" : t === value ? "text-cyan" : "text-text hover:bg-surface-2"
              }`}
            >
              {topicLabel(t)}
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
    <Card title="Design mock" hint={`${mockMinutes("design")} min: requirements, high-level design, deep dive, wrap-up.`}>
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
    </Card>
  );
}

export function BehavioralMockForm({ stories }: { stories: number }) {
  const [state, action] = useActionState<FormState, FormData>(startMockAction, {});
  return (
    <Card title="Behavioral mock" hint={`${mockMinutes("behavioral")} min: the question, follow-ups, reflection. Uses your stories.`}>
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
          <SubmitButton pendingLabel="Starting…">Start behavioral mock</SubmitButton>
          <Link href={STORY_BANK} className="self-start text-small font-semibold text-cyan">
            Manage your story bank
          </Link>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <EmptyState
            title="Add a story first"
            action={
              <Link href={STORY_BANK} className="text-small font-semibold text-cyan">
                Open your story bank
              </Link>
            }
          >
            Behavioral questions ask for your own examples, so a mock has nothing to ask without at least one story. Add one, then come
            back.
          </EmptyState>
          <button type="button" disabled className={PRIMARY}>
            Start behavioral mock
          </button>
        </div>
      )}
    </Card>
  );
}
