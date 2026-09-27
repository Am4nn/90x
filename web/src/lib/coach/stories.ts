import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { stories } from "@/db/schema";
import { STORY_TAGS, type StoryInput } from "./story-rules";

// Story bank reads and writes, always for one user id.

export type Story = StoryInput & { id: string };

const TAGS = new Set<string>(STORY_TAGS);

export async function listStories(userId: string): Promise<Story[]> {
  const rows = await db.select().from(stories).where(eq(stories.userId, userId)).orderBy(asc(stories.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    situation: r.situation,
    task: r.task,
    action: r.action,
    result: r.result,
    // The column defaults to {""}; keep only real tags.
    tags: r.tags.filter((t): t is Story["tags"][number] => TAGS.has(t)),
  }));
}

/** Creates a story, or updates one of the user's own. Returns false if the id isn't theirs. */
export async function saveStory(userId: string, id: string | null, input: StoryInput): Promise<boolean> {
  const values = { ...input, updatedAt: new Date().toISOString() };
  if (!id) {
    await db.insert(stories).values({ userId, ...values });
    return true;
  }
  const updated = await db
    .update(stories)
    .set(values)
    .where(and(eq(stories.id, id), eq(stories.userId, userId)))
    .returning({ id: stories.id });
  return updated.length > 0;
}

export async function deleteStory(userId: string, id: string) {
  await db.delete(stories).where(and(eq(stories.id, id), eq(stories.userId, userId)));
}
