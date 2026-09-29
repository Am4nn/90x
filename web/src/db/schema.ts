// Typed schema for Drizzle queries, pulled from the database.
// supabase/migrations is the source of truth: change a migration, push it,
// then run `bun run db:pull` to refresh ./pulled.
export * from "./pulled/schema";
export * from "./pulled/relations";
// Hand-written: tables added in 20260929000019_friends.sql, not yet in pulled/
// because the migration is unapplied. Remove this line after the next db:pull.
export * from "./friends-schema";
