import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { button } from "@/components/button-styles";
import { NewStory, StoryCard } from "@/components/coach/story-editor";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import { listStories } from "@/lib/coach/stories";
import { STORY_TARGET } from "@/lib/coach/story-rules";

export const metadata: Metadata = { title: "Story bank" };

export default async function StoriesPage() {
  const viewer = await requireViewer();
  const stories = await listStories(viewer.id);
  const done = Math.min(stories.length, STORY_TARGET);
  return (
    <>
      <div className="flex flex-col gap-2">
        <BackLink href="/coach" className="md:hidden">
          Coach
        </BackLink>
        <PageHeader
          title="Story bank"
          action={
            <div className="hidden md:flex">
              <Link href="/coach" className={button({ variant: "ghost", size: "sm" })}>
                Back to Coach
              </Link>
            </div>
          }
        />
        <p className="text-small text-mute">Six to eight STAR stories cover most behavioral questions. Only you can see them.</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">
            {stories.length} of {STORY_TARGET}
          </span>
          {stories.length >= 6 && (
            <Link href="/coach/mocks" className="text-small font-semibold text-cyan">
              Practise in a mock
            </Link>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-cyan" style={{ width: `${(done / STORY_TARGET) * 100}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {stories.map((s) => (
          <StoryCard key={s.id} story={s} />
        ))}
      </div>
      <NewStory key={stories.length} first={stories.length === 0} />
    </>
  );
}
