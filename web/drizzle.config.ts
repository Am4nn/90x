import { defineConfig } from "drizzle-kit";

// SQL migrations in ../supabase/migrations are the source of truth.
// Drizzle only pulls the schema from the database for typed queries.
export default defineConfig({
  dialect: "postgresql",
  out: "./src/db/pulled",
  // DIRECT_URL (port 5432): drizzle-kit needs a session connection, not the 6543 pooler.
  dbCredentials: { url: process.env.DIRECT_URL! },
  schemaFilter: ["public"],
});
