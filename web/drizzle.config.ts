import { defineConfig } from "drizzle-kit";

// SQL migrations in ../supabase/migrations are the source of truth.
// Drizzle only pulls the schema from the database for typed queries.
export default defineConfig({
  dialect: "postgresql",
  out: "./src/db/pulled",
  dbCredentials: { url: process.env.DATABASE_URL! },
  schemaFilter: ["public"],
});
