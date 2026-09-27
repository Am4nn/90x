import { z } from "zod";

// STAR story bank: 6-8 stories that behavioral mocks draw on.

export const STORY_TARGET = 8;
export const STORY_TAGS = ["leadership", "conflict", "failure", "impact", "ambiguity"] as const;

const field = z.string().trim().max(2000);

export const StorySchema = z.object({
  title: z.string().trim().min(1, "Give the story a title.").max(120),
  situation: field,
  task: field,
  action: field,
  result: field,
  tags: z.array(z.enum(STORY_TAGS)).max(STORY_TAGS.length),
});
export type StoryInput = z.infer<typeof StorySchema>;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Stories for the interviewer's prompt: title, tags and a clipped STAR summary each. */
export function storiesBlock(stories: (StoryInput & { id: string })[]): string {
  if (!stories.length) return "(no stories yet)";
  return stories
    .map((s) =>
      [
        `- ${s.title}${s.tags.length ? ` [${s.tags.join(", ")}]` : ""}`,
        `  S: ${clip(s.situation, 240) || "-"}`,
        `  T: ${clip(s.task, 240) || "-"}`,
        `  A: ${clip(s.action, 400) || "-"}`,
        `  R: ${clip(s.result, 240) || "-"}`,
      ].join("\n"),
    )
    .join("\n");
}
