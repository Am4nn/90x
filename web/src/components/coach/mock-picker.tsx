"use client";

import Link from "next/link";
import { useActionState } from "react";
import { startMockAction } from "@/app/actions/mocks";
import { ChipGroup } from "@/components/chip-group";
import { EmptyState } from "@/components/empty-state";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { BEHAVIORAL_QUESTIONS, mockMinutes } from "@/lib/coach/mock-rules";

// "Design a URL shortener" reads as "URL shortener" on a chip.
const chipLabel = (topic: string) => topic.replace(/^Design an? /i, "");

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

export function DesignMockForm({ topics }: { topics: string[] }) {
  const [state, action] = useActionState<FormState, FormData>(startMockAction, {});
  const first = topics[0];
  return (
    <Card title="Design mock" hint={`${mockMinutes("design")} min: requirements, high-level design, deep dive, wrap-up.`}>
      {first ? (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="type" value="design" />
          <ChipGroup name="topic" label="Problem" options={topics.map((t) => ({ value: t, label: chipLabel(t) }))} defaultValue={first} />
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
        </form>
      ) : (
        <EmptyState
          title="Add a story first"
          action={
            <Link href="/me/stories" className="text-small font-semibold text-cyan">
              Open your story bank
            </Link>
          }
        >
          The interviewer probes the STAR stories you&apos;ve written. Add at least one.
        </EmptyState>
      )}
    </Card>
  );
}
