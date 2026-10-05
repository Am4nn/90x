"use client";

import { useOptimistic, useState } from "react";
import { deleteMemoryNote, editMemoryNote } from "@/app/actions/coach";
import { button } from "@/components/button-styles";
import { ActionForm, Busy, SubmitButton, useServerAction } from "@/components/form";
import type { Fact, MemoryStatus } from "@/lib/coach/memory-rules";

const STATUS_CLASS: Record<MemoryStatus, string> = {
  active: "border-line-2 text-text-2",
  improving: "border-warn/40 text-warn",
  resolved: "border-ok/40 text-ok",
};

const secondary = button({ size: "sm" });

function FactRow({ fact }: { fact: Fact }) {
  const [editing, setEditing] = useState(false);
  const remove = useServerAction();
  // Delete and edit show their result on the tap; a failure puts the row back.
  const [gone, hide] = useOptimistic(false, (_: boolean, next: boolean) => next);
  const [text, showText] = useOptimistic(fact.text, (_: string, next: string) => next);
  // Updates inside an action only land when it finishes, so the editor closes optimistically too.
  const [editingNow, closeEditor] = useOptimistic(editing, (_: boolean, next: boolean) => next);
  const [draft, setDraft] = useState(fact.text);
  const [editError, setEditError] = useState<string | null>(null);
  if (gone) return null;
  return (
    <li className="flex flex-col gap-3 border-t border-line px-4 py-3.5 first:border-0">
      {editingNow ? (
        <ActionForm
          action={async (state, form) => {
            const next = String(form.get("text") ?? "");
            setDraft(next);
            setEditError(null);
            showText(next);
            closeEditor(false);
            setEditing(false);
            const result = await editMemoryNote(state, form);
            if (!result.ok) {
              // Back into the editor with what they typed, and the reason.
              setEditing(true);
              setEditError(result.error ?? "That didn't save. Try again.");
            }
            return result;
          }}
        >
          <input type="hidden" name="id" value={fact.id} />
          <textarea
            name="text"
            defaultValue={draft}
            rows={2}
            maxLength={300}
            aria-label="Note"
            className="rounded-xl border border-line-2 bg-background p-3 text-text outline-none focus:border-cyan"
          />
          <div className="flex gap-2">
            <SubmitButton pendingLabel="Saving…" className={button({ variant: "primary", size: "sm" })}>
              Save
            </SubmitButton>
            <button type="button" onClick={() => setEditing(false)} className={secondary}>
              Cancel
            </button>
          </div>
          {editError && (
            <p role="alert" className="text-small text-bad">
              {editError}
            </p>
          )}
        </ActionForm>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <span className="text-text">{text}</span>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-tag font-bold capitalize ${STATUS_CLASS[fact.status]}`}>
              {fact.status}
            </span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className={secondary}>
              Edit
            </button>
            <button
              type="button"
              onClick={() => remove.run(() => deleteMemoryNote(fact.id), { optimistic: () => hide(true) })}
              disabled={remove.pending}
              aria-busy={remove.pending || undefined}
              className={secondary}
            >
              <Busy busy={remove.pending}>{remove.pending ? "Deleting…" : "Delete"}</Busy>
            </button>
          </div>
          {remove.error && (
            <p role="alert" className="text-small text-bad">
              {remove.error}
            </p>
          )}
        </>
      )}
    </li>
  );
}

/** One kind of fact (habits, goals, …) with inline edit and delete. */
export function MemoryGroup({ title, facts }: { title: string; facts: Fact[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-heading font-semibold">{title}</h2>
      <ul className="flex flex-col rounded-xl border border-line bg-surface">
        {facts.map((f) => (
          <FactRow key={f.id} fact={f} />
        ))}
      </ul>
    </section>
  );
}
