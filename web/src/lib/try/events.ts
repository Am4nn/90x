import "server-only";
import { z } from "zod";
import { db } from "@/db";
import { tryEvents } from "@/db/schema";
import { TRY_CARD_KEYS, TRY_CARDS, TRY_TAB_SLUGS } from "@/lib/landing/try-cards";
import { SECOND_BUCKETS, type TRY_KINDS, TRY_SPOTS, TRY_STEPS } from "./steps";

// One anonymous /try event as the beacon sends it: a visit id made in the browser's memory, a kind, and a few
// small fields (a card, an option, a bucket of seconds). Nothing here can carry a person's words or identity.

const Visit = z.string().regex(/^[a-z0-9]{16,32}$/);
const Empty = z.strictObject({}).default({});

// Each kind carries exactly the fields the client sends (components/try/try-client.tsx) and nothing else: every
// value comes from a closed set (the card keys, tab slugs, spots, second buckets and steps), a boolean or an
// option number 0..3, and an unknown key is refused. So no free text can reach Postgres, and the old charset,
// length and size caps (which guarded free-form data) have nothing left to guard.
const OPTIONS = TRY_CARDS[0]?.options.length ?? 4;
const of = <K extends (typeof TRY_KINDS)[number], D extends z.ZodType>(kind: K, data: D) =>
  z.object({ visit: Visit, kind: z.literal(kind), data });

export const TryEventSchema = z.discriminatedUnion("kind", [
  of("view", Empty),
  of("listen_start", Empty),
  of("listen_95", Empty),
  of("tab", z.strictObject({ tab: z.enum(TRY_TAB_SLUGS) })),
  of(
    "answer",
    z.strictObject({
      card: z.enum(TRY_CARD_KEYS),
      option: z
        .int()
        .min(0)
        .max(OPTIONS - 1),
      correct: z.boolean(),
    }),
  ),
  of("listen_pause", z.strictObject({ at: z.enum(SECOND_BUCKETS) })),
  of("signin_click", z.strictObject({ spot: z.enum(TRY_SPOTS) })),
  of("leave", z.strictObject({ seconds: z.enum(SECOND_BUCKETS), step: z.enum(TRY_STEPS) })),
]);

/** Stores one event. The table has no API grant: only the app server writes it. */
export async function insertTryEvent(e: z.output<typeof TryEventSchema>): Promise<void> {
  await db.insert(tryEvents).values({ visit: e.visit, kind: e.kind, data: e.data });
}
