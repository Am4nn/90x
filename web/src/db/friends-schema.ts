import { sql } from "drizzle-orm";
import { check, index, pgPolicy, pgTable, text, timestamp, uniqueIndex, primaryKey, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

// Hand-written schema for the friends tables added in 20260929000019_friends.sql.
// The pulled/ schema is auto-generated from the live database; new tables that
// have not been pushed yet live here until the next `bun run db:pull`.

export const friendInvites = pgTable(
  "friend_invites",
  {
    id: uuid().primaryKey().defaultRandom(),
    // citext in Postgres — lower-cased on write, case-insensitive comparison.
    // Drizzle maps it as text; the database enforces the case folding.
    email: text().notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true, mode: "string" }),
    // Dismissed: recipient hid it, status stays pending, sender sees no change.
    dismissedAt: timestamp("dismissed_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("friend_invites_pending_idx")
      .on(table.invitedBy, table.email)
      .where(sql`status = 'pending'`),
    index("friend_invites_email_idx")
      .on(table.email)
      .where(sql`status = 'pending'`),
    check("friend_invites_status_check", sql`status in ('pending', 'accepted', 'revoked')`),
    check("friend_invites_check", sql`(status = 'pending') = (responded_at is null)`),
    pgPolicy("friend_invites_read", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`invited_by = auth.uid() or email = public.current_user_email()`,
    }),
    pgPolicy("friend_invites_send", {
      as: "permissive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`invited_by = auth.uid() and public.is_approved()`,
    }),
    pgPolicy("friend_invites_respond", {
      as: "permissive",
      for: "update",
      to: ["authenticated"],
      using: sql`email = public.current_user_email() or invited_by = auth.uid()`,
    }),
  ],
);

export const friendships = pgTable(
  "friendships",
  {
    userA: uuid("user_a")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userB: uuid("user_b")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    fromInvite: uuid("from_invite").references(() => friendInvites.id, { onDelete: "set null" }),
  },
  (table) => [
    primaryKey({ columns: [table.userA, table.userB], name: "friendships_pkey" }),
    check("friendships_order_check", sql`user_a < user_b`),
    pgPolicy("friendships_read", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`user_a = auth.uid() or user_b = auth.uid()`,
    }),
  ],
);
