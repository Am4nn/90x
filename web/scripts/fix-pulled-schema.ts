// Runs after `drizzle-kit pull` to fix two known problems in its output:
// 1. An empty-string default comes out as `.default(')` (invalid TS).
// 2. References to Supabase's auth.users are emitted without a definition
//    (schema.ts uses `users`, relations.ts imports `usersInAuth`).
import { readFileSync, writeFileSync } from "node:fs";

const path = "src/db/pulled/schema.ts";
let src = readFileSync(path, "utf8");

src = src.replaceAll(".default(')", ".default('')");

const importLine = 'import { users } from "../auth"';
if (/\busers\.id\b/.test(src) && !src.includes(importLine)) {
  src = src.replace(/(import \{ sql \} from "drizzle-orm"\n)/, `$1${importLine}\n`);
}

// relations.ts imports auth.users from ./schema under this name.
const reexport = 'export { users as usersInAuth } from "../auth";';
if (!src.includes(reexport))
  src = `${src.trimEnd()}

${reexport}
`;

writeFileSync(path, src);
console.log("fixed", path);
