"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { deleteStoryAction, saveStoryAction } from "@/app/actions/stories";
import { button, chip } from "@/components/button-styles";
import { FormMessage, type FormState, SubmitButton, useServerAction } from "@/components/form";
import { STORY_TAGS, type StoryInput } from "@/lib/coach/story-rules";

// STAR story bank editor: one form per story, tags as toggle chips.

type Story = StoryInput & { id: string };

const FIELDS = [
  { name: "situation", label: "Situation", hint: "Where and when; the context in two lines." },
  { name: "task", label: "Task", hint: "What you had to do, and why it was hard." },
  { name: "action", label: "Action", hint: "What you did (not the team). The longest part." },
  { name: "result", label: "Result", hint: "What changed, with numbers if you have them." },
] as const;

const input = "w-full rounded-xl border border-line-2 bg-surface px-3 py-2.5 text-text outline-none focus:border-cyan";
const secondary = button();
const secondarySm = button({ variant: "secondary", size: "sm" });

function TagChips({ initial }: { initial: Story["tags"] }) {
  const [tags, setTags] = useState<string[]>(initial);
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 text-small font-semibold text-text-2">Tags</legend>
      {tags.map((t) => (
        <input key={t} type="hidden" name="tags" value={t} />
      ))}
      <div className="flex flex-wrap gap-2">
        {STORY_TAGS.map((t) => {
          const on = tags.includes(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
              className={`${chip(on)} capitalize`}
            >
              {t}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function StoryForm({ story, onDone }: { story?: Story; onDone?: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(async (prev, form) => {
    const result = await saveStoryAction(prev, form);
    if (result.ok) onDone?.();
    return result;
  }, {});
  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <input type="hidden" name="id" value={story?.id ?? ""} />
      <label className="flex flex-col gap-1.5">
        <span className="text-small font-semibold text-text-2">Title</span>
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={story?.title}
          placeholder="Migrated billing without downtime"
          className={input}
        />
      </label>
      {FIELDS.map((f) => (
        <label key={f.name} className="flex flex-col gap-1.5">
          <span className="text-small font-semibold text-text-2">{f.label}</span>
          <textarea
            name={f.name}
            rows={f.name === "action" ? 5 : 3}
            maxLength={2000}
            defaultValue={story?.[f.name]}
            placeholder={f.hint}
            className={input}
          />
        </label>
      ))}
      <TagChips initial={story?.tags ?? []} />
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{story ? "Save story" : "Add story"}</SubmitButton>
        {onDone && (
          <button type="button" onClick={onDone} className={secondary}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function StoryCard({ story }: { story: Story }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { run, pending, error } = useServerAction();
  if (editing) return <StoryForm story={story} onDone={() => setEditing(false)} />;
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-heading font-semibold">{story.title}</h3>
        {story.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {story.tags.map((t) => (
              <span key={t} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-tag font-semibold text-text-2 capitalize">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-small">
        {FIELDS.filter((f) => story[f.name].trim()).map((f) => (
          <div key={f.name} className="contents">
            <dt className="font-semibold text-mute">{f.label[0]}</dt>
            <dd className="line-clamp-2 text-text-2">{story[f.name]}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setEditing(true)} className={secondarySm}>
          Edit
        </button>
        {/* The composer doesn't take a prefilled message yet, so this opens the chat. */}
        <Link href="/coach" className={secondarySm}>
          Improve with Coach
        </Link>
        <button
          type="button"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={() => (confirming ? run(() => deleteStoryAction(story.id)) : setConfirming(true))}
          onBlur={() => setConfirming(false)}
          className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-small font-semibold whitespace-nowrap transition-colors disabled:opacity-60 ${
            confirming ? "text-bad" : "text-text-2 hover:bg-surface-2 hover:text-text"
          }`}
        >
          {pending ? "Deleting…" : confirming ? "Tap again to delete" : "Delete"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </article>
  );
}

export function NewStory({ first }: { first: boolean }) {
  const [open, setOpen] = useState(first);
  if (open) return <StoryForm onDone={first ? undefined : () => setOpen(false)} />;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`${button({ variant: "primary", size: "lg" })} w-full md:w-auto md:self-start`}
    >
      Add a story
    </button>
  );
}
