import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { reviewSolution } from "@/app/actions/review";
import { BackLink } from "@/components/back-link";
import { ChipGroup } from "@/components/chip-group";
import { ActionForm, SubmitButton } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import { CODE_MAX_CHARS } from "@/lib/coach/review-rules";
import { reviewFormData } from "@/lib/coach/solution-review";
import { LANGUAGES } from "@/lib/setup";

export const metadata: Metadata = { title: "Review my solution" };

// The review is one DeepSeek Pro call (with a retry) inside the form's server action.
export const maxDuration = 120;

export default async function ReviewFormPage({ params, searchParams }: PageProps<"/library/problem/[slug]/review">) {
  const viewer = await requireViewer();
  const { slug } = await params;
  const { checkin } = await searchParams;
  const checkinId = typeof checkin === "string" && z.uuid().safeParse(checkin).success ? checkin : null;
  const data = await reviewFormData(viewer.id, slug, checkinId);
  if (!data) notFound();
  const { problem } = data;
  const submission = data.checkin?.source === "leetcode_sync" && data.checkin.externalId ? data.checkin.externalId : null;
  const language = LANGUAGES.find((l) => l.value === viewer.language)?.value ?? "java";

  return (
    <>
      <div className="flex flex-col gap-2">
        <BackLink href={`/library/problem/${problem.slug}`}>{problem.title}</BackLink>
        <PageHeader title="Review my solution" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <ActionForm action={reviewSolution} className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
          <input type="hidden" name="slug" value={problem.slug} />
          {data.checkin && <input type="hidden" name="checkinId" value={data.checkin.id} />}
          <ChipGroup name="language" label="Language" options={LANGUAGES} defaultValue={language} />
          <label className="flex flex-col gap-2.5">
            <span className="text-small font-semibold text-text-2">Your code</span>
            <textarea
              name="code"
              required
              rows={16}
              maxLength={CODE_MAX_CHARS}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="Paste your solution"
              className="rounded-xl border border-line-2 bg-background p-3 font-mono text-small leading-relaxed text-text outline-none focus:border-cyan"
            />
          </label>
          <SubmitButton pendingLabel="Coach is reading your code…">Review my solution</SubmitButton>
        </ActionForm>

        <aside className="flex flex-col gap-4">
          {submission && (
            <a
              href={`https://leetcode.com/submissions/detail/${submission}/`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-line bg-surface p-4 font-semibold text-text hover:bg-surface-2"
            >
              Open my submission ↗
              <span className="mt-1 block text-small font-normal text-mute">Copy your code from LeetCode and paste it here.</span>
            </a>
          )}
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 text-small text-text-2">
            <span className="font-semibold text-text">What you get</span>
            <p>
              Whether it&apos;s correct, its time and space next to the best known, notes on specific lines, the one idea to keep, and a
              next problem that uses it.
            </p>
            <p className="text-mute">Only you see your reviews.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
