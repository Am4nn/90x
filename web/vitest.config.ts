import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
      // Only what the unit tests are meant to cover: the pure rules. Components,
      // pages, server actions and the db layer are covered by Playwright and the
      // check:* scripts against a real database, and counting them here would
      // measure the wrong thing and invite tests that exist to move a number.
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/supabase/database.types.ts", "src/lib/**/index.ts"],
    },
  },
});
