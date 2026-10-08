import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stories } from "@/db/schema";
import { deleteFact, editFact } from "@/lib/coach/memory-edit";
import { endMock, listMocks, mockView } from "@/lib/coach/mocks";
import { takeMessageSlot } from "@/lib/coach/rate-limit";
import { getSolutionReview } from "@/lib/coach/solution-review";
import { deleteStory, listStories, saveStory } from "@/lib/coach/stories";
import { getThread, listThreads } from "@/lib/coach/threads";
import { accept, invite } from "@/lib/friends/service";
import { allows, check, refuses, section, skipped } from "./harness";
import type { World } from "./world";

// A check must never send real email: with these unset, sendEmailBestEffort
// swallows the failure, so a rolled-back invite leaves no trace.
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

// Everything that can be attacked by calling the server's own functions. No
// HTTP: these are the guards themselves, tried directly with the wrong identity,
// so a round that holds here says the rule exists, and `http.ts` says the routes
// actually reach it. The DB layer is already proven by check-rls.ts and the
// coach tools by check-coach-tools.ts; this covers the services neither touches.

export async function run(w: World): Promise<void> {
  const { admin, friend, nonFriend } = w;

  section("1. another user's private rows");
  check("a friend cannot read your solution review", (await getSolutionReview(friend, w.reviewId)) === null);
  check("a friend cannot read your mock transcript", (await mockView(friend, w.mockId)) === null);
  check("a non-friend cannot read your mock transcript", (await mockView(nonFriend, w.mockId)) === null);
  check("a friend cannot read your coach thread", (await getThread(friend, w.threadId)) === null);
  const friendStories = await listStories(friend);
  check("a friend's story list has none of yours", friendStories.length === 0 && !friendStories.some((s) => s.id === w.storyId));
  check("a friend's mock list has none of yours", (await listMocks(friend)).length === 0);
  check("a friend's thread list has none of yours", (await listThreads(friend)).length === 0);

  section("2. forged writes");
  check(
    "a friend cannot overwrite your story",
    (await saveStory(friend, w.storyId, { title: "hacked", situation: "", task: "", action: "", result: "", tags: [] })) === false,
  );
  await deleteStory(friend, w.storyId);
  const [still] = await db.select({ id: stories.id }).from(stories).where(eq(stories.id, w.storyId));
  check("a friend cannot delete your story", still !== undefined);
  check("a friend cannot edit your memory", (await editFact(friend, w.factId, { text: "hacked" })) === false);
  check("a friend cannot delete your memory", (await deleteFact(friend, w.factId)) === false);
  const mockEnd = await endMock(friend, w.mockId);
  check("a friend cannot end your mock", "error" in mockEnd);

  section("3. invites");
  await refuses("you cannot invite yourself", () => invite(friend, `brk-${w.tag}-friend@example.test`));
  await refuses("an invite cannot be accepted from another email", () => accept(w.inviteId, admin, "someone-else@example.test"));
  await allows("the invite is accepted by the address it names", () => accept(w.inviteId, admin, `brk-${w.tag}-admin@example.test`));

  section("4. rate limits");
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    // The coach limiter fails CLOSED when Upstash is unreachable, so without it every call is refused and
    // "held" would pass vacuously. The limiter's own unit test covers the fail-closed decision.
    skipped("the coach ceiling", "no UPSTASH_REDIS_REST_URL in this environment");
  } else {
    let refused: string | null = null;
    for (let i = 0; i < 35 && refused === null; i += 1) {
      const r = await takeMessageSlot(admin);
      if (!r.allowed) refused = `after ${i + 1}`;
    }
    check("the coach ceiling refuses a flood", refused !== null, refused ?? "never refused");
  }
}
