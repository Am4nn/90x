import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";

// The world every round runs against: four people it made itself, one friendship,
// and one of each kind of private row the app owns.
//
// IT BORROWS NOBODY. Everything here is created by the run and deleted at the
// end, keyed to the run's own tag and ids, so the same round runs anywhere:
// a throwaway local Supabase, or preview. `leftovers` is the assertion that
// teardown left nothing behind.

export interface World {
  tag: string;
  /** The admin the round created. Escalation rounds act as this one. */
  admin: string;
  /** An approved user who is a friend of the admin. */
  friend: string;
  /** An approved user who is no one's friend. */
  nonFriend: string;
  /** A user whose approval is still pending. */
  pending: string;
  /** A live problem slug, so reviews and check-ins have something to point at. */
  problemSlug: string;
  /** A live card, so the feed round has something to answer. */
  cardId: string;
  batchId: string;
  /** The admin's solution review, mock, story, thread and memory fact. */
  reviewId: string;
  mockId: string;
  storyId: string;
  threadId: string;
  factId: string;
  /** A pending invite into the admin's inbox, sent by the friend. */
  inviteId: string;
}

const USERS = {
  admin: "00000000-0000-4000-8000-00000000000a",
  friend: "00000000-0000-4000-8000-00000000000b",
  nonFriend: "00000000-0000-4000-8000-00000000000c",
  pending: "00000000-0000-4000-8000-00000000000d",
} as const;

export async function build(): Promise<World> {
  const tag = randomUUID().slice(0, 6);
  const w: World = {
    tag,
    ...USERS,
    problemSlug: `brk-${tag}-problem`,
    cardId: "",
    batchId: "",
    reviewId: "",
    mockId: "",
    storyId: "",
    threadId: "",
    factId: "",
    inviteId: "",
  };

  await db.transaction(async (tx) => {
    for (const [key, id] of Object.entries(USERS)) {
      await tx.execute(
        sql`insert into auth.users (id, email, aud, role, raw_user_meta_data)
            values (${id}, ${`brk-${tag}-${key}@example.test`}, 'authenticated', 'authenticated',
                    ${JSON.stringify({ full_name: `Break ${key}` })}::jsonb)`,
      );
    }
    await tx.execute(
      sql`update public.user_approvals set status = 'approved', decided_at = now()
          where user_id in (${USERS.admin}, ${USERS.friend}, ${USERS.nonFriend})`,
    );
    await tx.execute(sql`update public.user_approvals set is_admin = true where user_id = ${USERS.admin}`);
    await tx.execute(sql`update public.profiles set name = ${`Break admin`}, setup_done_at = now() where user_id = ${USERS.admin}`);
    await tx.execute(sql`insert into public.friendships (user_a, user_b) values (${USERS.admin}, ${USERS.friend})`);

    await tx.execute(sql`insert into public.sources (id, name, domain, role) values (${`brk-${tag}-src`}, 'Break source', 'dsa', 'cards')`);
    await tx.execute(
      sql`insert into public.topics (slug, domain, name, importance, sort) values (${w.problemSlug}, 'dsa', 'Break topic', 1, 999)`,
    );
    await tx.execute(
      sql`insert into public.problems (slug, kind, title, difficulty, pattern_slug, importance, statement_md, source_id)
          values (${w.problemSlug}, 'leetcode', 'Break problem', 'Easy', ${w.problemSlug}, 1, 'statement', ${`brk-${tag}-src`})`,
    );
    const [batch] = await tx.execute<{ id: string }>(
      sql`insert into public.card_batches (domain, status) values ('dsa', 'draft') returning id`,
    );
    w.batchId = batch!.id;
    const [card] = await tx.execute<{ id: string }>(
      sql`insert into public.cards (batch_id, topic_slug, format, prompt_md, answer_md, status)
          values (${w.batchId}, ${w.problemSlug}, 'typed', 'Break card', 'x', 'live') returning id`,
    );
    w.cardId = card!.id;

    const [review] = await tx.execute<{ id: string }>(
      sql`insert into public.solution_reviews (user_id, problem_slug, language, code, review)
          values (${USERS.admin}, ${w.problemSlug}, 'python', 'print(1)', '{}'::jsonb) returning id`,
    );
    w.reviewId = review!.id;
    const [mock] = await tx.execute<{ id: string }>(
      sql`insert into public.mocks (user_id, type, topic, status, score) values (${USERS.admin}, 'design', 'Break mock', 'done', 80) returning id`,
    );
    w.mockId = mock!.id;
    await tx.execute(
      sql`insert into public.mock_details (mock_id, user_id, prompt) values (${w.mockId}, ${USERS.admin}, 'Break transcript')`,
    );
    const [story] = await tx.execute<{ id: string }>(
      sql`insert into public.stories (user_id, title) values (${USERS.admin}, 'Break story') returning id`,
    );
    w.storyId = story!.id;
    const [thread] = await tx.execute<{ id: string }>(
      sql`insert into public.coach_threads (user_id, kind, title) values (${USERS.admin}, 'chat', 'Break thread') returning id`,
    );
    w.threadId = thread!.id;
    await tx.execute(
      sql`insert into public.coach_messages (thread_id, user_id, role, parts) values (${w.threadId}, ${USERS.admin}, 'user', '[]'::jsonb)`,
    );
    const [fact] = await tx.execute<{ id: string }>(
      sql`insert into public.coach_memory (user_id, kind, text) values (${USERS.admin}, 'goal', 'Break goal') returning id`,
    );
    w.factId = fact!.id;
    const [invite] = await tx.execute<{ id: string }>(
      sql`insert into public.friend_invites (email, invited_by) values (${`brk-${tag}-admin@example.test`}, ${USERS.friend}) returning id`,
    );
    w.inviteId = invite!.id;
  });

  return w;
}

/** Put the database back exactly as it was found. */
export async function teardown(w: World): Promise<void> {
  await db.transaction(async (tx) => {
    // Content rows are not user-owned, so the auth.users cascade will not reach
    // them. Delete them first, cards before their batch, then the problem (which
    // cascades the review and any check-in) before its topic and source.
    await tx.execute(sql`delete from public.cards where id = ${w.cardId}`);
    await tx.execute(sql`delete from public.card_batches where id = ${w.batchId}`);
    await tx.execute(sql`delete from public.problems where slug = ${w.problemSlug}`);
    await tx.execute(sql`delete from public.topics where slug = ${w.problemSlug}`);
    await tx.execute(sql`delete from public.sources where id = ${`brk-${w.tag}-src`}`);
    // Every user-owned row (profiles, approvals, friendships, invites, reviews,
    // mocks, stories, threads, memory, check-ins, ...) cascades from auth.users.
    await tx.execute(sql`delete from auth.users where id in (${w.admin}, ${w.friend}, ${w.nonFriend}, ${w.pending})`);
  });
}

/** Whether anything the run made is still there. Called after teardown. */
export async function leftovers(w: World): Promise<number> {
  // auth.users cascades every user-owned row, so the four ids cover them. The
  // content rows (which cascade cards, reviews and check-ins) are the rest.
  const [users] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from auth.users where id in (${w.admin}, ${w.friend}, ${w.nonFriend}, ${w.pending})`,
  );
  const [content] = await db.execute<{ n: number }>(sql`
    select
      (select count(*)::int from public.problems where slug = ${w.problemSlug}) +
      (select count(*)::int from public.topics where slug = ${w.problemSlug}) +
      (select count(*)::int from public.sources where id = ${`brk-${w.tag}-src`}) +
      (select count(*)::int from public.card_batches where id = ${w.batchId}) as n`);
  return (users?.n ?? 0) + (content?.n ?? 0);
}
