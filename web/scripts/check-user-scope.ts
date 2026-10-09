// Every server query on a user-owned table names its owner.
//
//   bun run check:user-scope
//
// Drizzle connects as a role row-level security does not apply to (src/db/index.ts),
// so the only thing keeping one person's rows from another is that each query
// filters on user_id by hand. One forgotten predicate is a data leak that every
// test written for the happy path will pass. check:rls proves the policies; this
// proves the other ~95% of queries, the ones that never meet a policy.
//
// What it reads: src/lib/** and src/app/** (not tests). What it looks for:
//   - a Drizzle select/update/delete chain that touches a user-owned table through
//     .from/.update/.delete/.*Join/$count and never names that table's owner column in a
//     .where/.having or a join condition (directly, or through a const in the same
//     file that the predicate uses);
//   - a raw sql`` template that reads, updates or deletes a user-owned table and
//     never mentions its owner column.
// Inserts are not checked: the row being written carries the owner.
// A user-owned table is one whose pulled schema has a user_id, user_a/user_b or
// invited_by column, so a new table is covered the day it is pulled.
//
// Some queries are cross-user on purpose (admin pages, analytics, jobs that loop
// over everyone, the invite lookup by email). Each is listed in ALLOWED with the
// reason, by file, function and table, and an entry that no longer matches
// anything fails the check, so the list cannot quietly outlive the code.
//
// It is a text check on the AST, not a proof: `eq(cardState.userId, someoneElse)`
// passes. It catches the mistake that actually happens, which is no scope at all.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = path.join(WEB, "src/db/pulled/schema.ts");
const ROOTS = ["src/lib", "src/app"];
const SCHEMA_MODULES = new Set(["@/db/schema", "@/db/pulled/schema"]);
const OWNER_COLUMNS = new Set(["user_id", "user_a", "user_b", "invited_by"]);
const TABLE_CALLS = new Set(["from", "update", "delete", "innerJoin", "leftJoin", "rightJoin", "fullJoin", "$count"]);
const PREDICATE_CALLS = new Set(["where", "having"]);

type Table = { name: string; owners: { prop: string; column: string }[] };

// `file#function:table` -> why this query may read across users.
const ALLOWED: Record<string, string> = {
  // Admin. Every admin page and action checks the admin first (requireAdmin/adminViewer,
  // enforced by the admin-guard test), and reading across users is the point.
  "src/app/admin/page.tsx#AdminHome:user_approvals": "admin dashboard: pending/approved counts over everyone",
  "src/app/admin/page.tsx#AdminHome:problem_reports": "admin dashboard: open report count over everyone",
  "src/app/admin/page.tsx#AdminHome:push_subscriptions": "admin dashboard: push delivery health over every device",
  "src/app/admin/cards/actions.ts#resolveFlag:card_flags": "admin clears every user's flags on a card it has dealt with",
  "src/app/admin/reports/actions.ts#setResolved:problem_reports": "admin resolves a user's problem report by id",
  "src/app/admin/users/actions.ts#approveAllWaiting:user_approvals": "admin approves every pending user at once",
  "src/lib/account/deleted.ts#deletedAccounts:deleted_accounts":
    "admin users page: the Deleted section and the all-time count. user_id names an account that no longer exists, not an owner who reads it",
  "src/lib/account/deleted.ts#purgeDeletedAccounts:deleted_accounts":
    "hourly job: empties every deletion record older than 90 days; no owner exists to scope by",
  "src/lib/admin/analytics.ts#compute:ai_usage": "admin analytics: AI spend per day over everyone",
  "src/lib/admin/badges.ts#adminBadges:user_approvals": "admin nav badge: pending approvals over everyone",
  "src/lib/admin/cards.ts#flaggedCards:card_flags": "admin card review: flags from every reader",
  "src/lib/admin/cards.ts#flaggedCards:profiles": "admin card review: the flagger's name next to the flag",
  "src/lib/admin/cards.ts#ratedCards:card_ratings": "admin card review: ratings from every reader",
  "src/lib/admin/cards.ts#ratingTotals:card_ratings": "admin card review: rating totals over every reader",
  // Jobs. Run by QStash with a verified signature, never by a viewer, and they loop over everyone.
  "src/app/api/jobs/hourly/route.ts#POST:profiles": "hourly job: every approved, set-up user whose local hour is due",
  "src/app/api/jobs/hourly/route.ts#POST:user_approvals": "hourly job: joins approvals to keep it to approved users",
  "src/lib/activity/service.ts#usersToSync:profiles": "LeetCode sync job: every user with a username",
  "src/lib/feed/flag-service.ts#hideStaleCards:card_reviews": "daily job: skip counts per card over every reader",
  "src/lib/push.ts#recordOutcome:push_subscriptions": "push sender records each device's delivery result by the id it just sent to",
  // Shared state that is about a catalog row or a link, not one person's data.
  "src/lib/ai/usage.ts#fromTable:ai_usage": "spend guard: the global budget sums everyone; the per-user meter adds user_id",
  "src/lib/feed/flag-service.ts#reportCard:card_flags":
    "counts every reader's flags on a card to decide whether to hide it; returns a number only",
  "src/lib/coach/threads.ts#threadOwner:coach_threads": "returns a thread's owner so the caller can refuse anyone else's",
  "src/lib/friends/service.ts#requirePendingInvite:friend_invites":
    "loads an invite by id; every caller then checks it is addressed to the viewer's email, or sent by the viewer",
  "src/lib/friends/service.ts#forgetInvitesTo:friend_invites":
    "account deletion: invites addressed to the deleting person's own email (read from auth.users by their id), so the next owner of the address inherits none",
  "src/lib/friends/service.ts#updatePendingInvite:friend_invites": "same: called only after requirePendingInvite and the email match",
  "src/lib/share/service.ts#cardModelForCode:share_codes": "public share page: a code resolves to its owner by design",
  "src/lib/share/service.ts#cardModelForCode:user_approvals": "public share page: only an approved owner's code resolves",
  "src/lib/share/service.ts#countCardView:share_codes": "public card image: an origin render bumps the views counter of the code it shows",
};

/** Tables with an owner column, keyed by their export name in the pulled schema. */
function userTables(source: string): Map<string, Table> {
  const file = ts.createSourceFile("schema.ts", source, ts.ScriptTarget.Latest, true);
  const tables = new Map<string, Table>();
  for (const stmt of file.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      const init = decl.initializer;
      if (!ts.isIdentifier(decl.name) || !init || !ts.isCallExpression(init)) continue;
      if (!ts.isIdentifier(init.expression) || init.expression.text !== "pgTable") continue;
      const [nameArg, columns] = init.arguments;
      if (!nameArg || !ts.isStringLiteral(nameArg) || !columns || !ts.isObjectLiteralExpression(columns)) continue;
      const owners: Table["owners"] = [];
      for (const prop of columns.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
        const column = columnName(prop.initializer) ?? snake(prop.name.text);
        if (OWNER_COLUMNS.has(column)) owners.push({ prop: prop.name.text, column });
      }
      if (owners.length) tables.set(decl.name.text, { name: nameArg.text, owners });
    }
  }
  return tables;
}

/** `uuid("user_id").notNull()` -> "user_id"; `uuid()` -> null (the column is the property name). */
function columnName(expr: ts.Expression): string | null {
  let node: ts.Node = expr;
  while (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) node = node.expression.expression;
  if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) return node.arguments[0].text;
  return null;
}

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

type Finding = { file: string; line: number; fn: string; table: string; what: string };

/** The violations in one file, plus every allowlist key a query in it would need. */
function scanFile(file: string, source: string, tables: Map<string, Table>): Finding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  // local import name -> table
  const imported = new Map<string, Table>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (!SCHEMA_MODULES.has(stmt.moduleSpecifier.text)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      const table = tables.get((el.propertyName ?? el.name).text);
      if (table) imported.set(el.name.text, table);
    }
  }
  const byName = new Map([...tables.values()].map((t) => [t.name, t]));
  const consts = new Map<string, ts.Expression>();
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) consts.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  };
  collect(sf);

  const findings: Finding[] = [];
  const report = (node: ts.Node, table: string, what: string) =>
    findings.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, fn: enclosingName(node), table, what });

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      TABLE_CALLS.has(node.expression.name.text) &&
      node.arguments[0] &&
      ts.isIdentifier(node.arguments[0])
    ) {
      const local = node.arguments[0].text;
      const table = imported.get(local);
      if (table && !scoped(local, predicateText(chainRoot(node), consts), imported))
        report(
          node,
          table.name,
          `.${node.expression.name.text}(${local}) with no ${table.owners.map((o) => `${local}.${o.prop}`).join("/")} in its predicate`,
        );
    }
    if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === "sql") {
      for (const table of rawTables(node, imported, byName)) {
        const text = node.template.getText();
        const named = table.owners.some(
          (o) => text.includes(o.column) || [...imported].some(([l, t]) => t === table && text.includes(`${l}.${o.prop}`)),
        );
        if (!named) report(node, table.name, `raw sql on ${table.name} with no ${table.owners.map((o) => o.column).join("/")}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

/**
 * Whether a predicate names `local`'s owner. `eq(a.userId, b.userId)` only ties two
 * user tables together, so it counts for neither on its own: the tables it links are
 * scoped when one of them is scoped by something else.
 */
function scoped(local: string, text: string, imported: Map<string, Table>): boolean {
  const isOwner = (l: string, prop: string) => imported.get(l)?.owners.some((o) => o.prop === prop) ?? false;
  const links: [string, string][] = [];
  const rest = text.replace(/\beq\(\s*(\w+)\.(\w+)\s*,\s*(\w+)\.(\w+)\s*\)/g, (m, a: string, ap: string, b: string, bp: string) => {
    if (!isOwner(a, ap) || !isOwner(b, bp)) return m;
    links.push([a, b]);
    return "";
  });
  const direct = (l: string) => imported.get(l)!.owners.some((o) => rest.includes(`${l}.${o.prop}`));
  const reached = new Set([local]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [a, b] of links)
      for (const [from, to] of [
        [a, b],
        [b, a],
      ] as const)
        if (reached.has(from) && !reached.has(to)) {
          reached.add(to);
          grew = true;
        }
  }
  return [...reached].some(direct);
}

/** Climbs `a.b(...).c(...)` to the outermost call of the method chain. */
function chainRoot(call: ts.CallExpression): ts.CallExpression {
  let node = call;
  while (ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node && ts.isCallExpression(node.parent.parent))
    node = node.parent.parent;
  return node;
}

/** The text of every predicate in a chain: .where/.having arguments and join conditions, with same-file consts expanded. */
function predicateText(root: ts.CallExpression, consts: Map<string, ts.Expression>): string {
  const parts: string[] = [];
  let node: ts.Expression = root;
  while (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const name = node.expression.name.text;
    // A join's condition and `$count(table, filter)`'s filter come after the table.
    const args = PREDICATE_CALLS.has(name) ? node.arguments : name.endsWith("Join") || name === "$count" ? node.arguments.slice(1) : [];
    for (const arg of args) parts.push(expand(arg, consts, 0));
    node = node.expression.expression;
  }
  return parts.join("\n");
}

function expand(node: ts.Node, consts: Map<string, ts.Expression>, depth: number): string {
  const seen: string[] = [node.getText()];
  if (depth > 3) return seen[0]!;
  const walk = (n: ts.Node) => {
    if (ts.isIdentifier(n) && consts.has(n.text) && consts.get(n.text) !== node) seen.push(expand(consts.get(n.text)!, consts, depth + 1));
    ts.forEachChild(n, walk);
  };
  walk(node);
  return seen.join("\n");
}

/** User tables a raw template reads, updates or deletes: by SQL name, or as an interpolated table. */
function rawTables(node: ts.TaggedTemplateExpression, imported: Map<string, Table>, byName: Map<string, Table>): Set<Table> {
  const found = new Set<Table>();
  const tpl = node.template;
  const chunks = ts.isNoSubstitutionTemplateLiteral(tpl) ? [tpl.text] : [tpl.head.text, ...tpl.templateSpans.map((s) => s.literal.text)];
  const sqlText = chunks.join(" ");
  for (const m of sqlText.matchAll(/\b(?:from|join|update)\s+(?:public\.)?"?([a-z_]+)"?/gi)) {
    const table = byName.get(m[1]!.toLowerCase());
    if (table) found.add(table);
  }
  if (!ts.isNoSubstitutionTemplateLiteral(tpl))
    tpl.templateSpans.forEach((span, i) => {
      const before = (i === 0 ? tpl.head.text : tpl.templateSpans[i - 1]!.literal.text).trimEnd();
      const table = ts.isIdentifier(span.expression) ? imported.get(span.expression.text) : undefined;
      if (table && /\b(?:from|join|update)$/i.test(before)) found.add(table);
    });
  return found;
}

function enclosingName(node: ts.Node): string {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) return n.name.getText();
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent)) return n.parent.name.getText();
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isPropertyAssignment(n.parent)) return n.parent.name.getText();
    // `export const POST = qstashJob(PATH, async () => ...)`
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isCallExpression(n.parent) && ts.isVariableDeclaration(n.parent.parent))
      return n.parent.parent.name.getText();
  }
  return "<module>";
}

const keyOf = (f: Finding) => `${f.file}#${f.fn}:${f.table}`;

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const root of ROOTS)
    for (const entry of readdirSync(path.join(WEB, root), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      out.push(path.relative(WEB, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"));
    }
  return out.toSorted();
}

// The check checks itself first: a scanner that stopped seeing queries would pass everything.
function selfTest(tables: Map<string, Table>) {
  const imports = `import { cardReviews, cardState, cards } from "@/db/schema";\n`;
  const cases: [string, number][] = [
    [`async function a(q, u) { return q.select().from(cardState).where(eq(cardState.cardId, "x")); }`, 1],
    [`async function b(q, u) { return q.select().from(cardState).where(eq(cardState.userId, u)); }`, 0],
    [`const mine = (u) => eq(cardState.userId, u);\nasync function c(q, u) { return q.select().from(cardState).where(and(mine(u))); }`, 0],
    [`async function d(q, u) { return q.select().from(cards).innerJoin(cardState, eq(cardState.cardId, cards.id)); }`, 1],
    [`async function e(q, u) { return q.update(cardState).set({ dueAt: null }).where(eq(cardState.cardId, "x")); }`, 1],
    [`async function f(q, u) { return q.execute(sql\`select * from public.card_state where card_id = \${u}\`); }`, 1],
    [`async function g(q, u) { return q.execute(sql\`delete from public.card_state where user_id = \${u}\`); }`, 0],
    [`async function h(q, u) { return q.select({ u: cardState.userId }).from(cardState); }`, 1],
    [`async function i(q, u) { return q.select().from(cardState).innerJoin(cardReviews, eq(cardReviews.userId, cardState.userId)); }`, 2],
    [`async function k(q, u) { return q.$count(cardState, eq(cardState.cardId, "x")); }`, 1],
    [
      `async function j(q, u) { return q.select().from(cardState).innerJoin(cardReviews, eq(cardReviews.userId, cardState.userId)).where(eq(cardState.userId, u)); }`,
      0,
    ],
  ];
  for (const [code, expected] of cases) {
    const got = scanFile("self-test.ts", imports + code, tables).length;
    if (got !== expected) {
      console.error(`check:user-scope self-test failed: expected ${expected} finding(s), got ${got}, for:\n${code}`);
      process.exit(1);
    }
  }
}

const tables = userTables(readFileSync(SCHEMA, "utf8"));
if (tables.size < 20) {
  console.error(`check:user-scope: found only ${tables.size} user-owned tables in ${SCHEMA}; the schema parser is broken`);
  process.exit(1);
}
selfTest(tables);

const findings = sourceFiles().flatMap((file) => scanFile(file, readFileSync(path.join(WEB, file), "utf8"), tables));
const used = new Set<string>();
const violations = findings.filter((f) => {
  const key = keyOf(f);
  if (key in ALLOWED) {
    used.add(key);
    return false;
  }
  return true;
});
const stale = Object.keys(ALLOWED).filter((k) => !used.has(k));

for (const v of violations) console.error(`${v.file}:${v.line}  ${v.fn}  ${v.what}\n    allowlist key: ${keyOf(v)}`);
for (const k of stale) console.error(`stale allowlist entry (matches no query now): ${k}`);
if (violations.length || stale.length) {
  console.error(
    `\ncheck:user-scope: ${violations.length} unscoped quer${violations.length === 1 ? "y" : "ies"} on user-owned tables, ${stale.length} stale allowlist entr${stale.length === 1 ? "y" : "ies"}.` +
      `\nScope the query to the viewer's id, or, if it is cross-user on purpose, add its key to ALLOWED with the reason.`,
  );
  process.exit(1);
}
console.log(`check:user-scope: ${tables.size} user-owned tables, ${findings.length} cross-user queries all allowlisted, the rest scoped.`);
