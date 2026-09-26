import { pgSchema, text, uuid } from "drizzle-orm/pg-core";

// Supabase's auth.users, declared by hand: `db:pull` only reads the public
// schema, but public tables reference it. Only the columns we read.
const auth = pgSchema("auth");

export const users = auth.table("users", {
  id: uuid().primaryKey(),
  email: text(),
});
