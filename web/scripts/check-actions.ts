// Is any action CI itself runs on out of date?
//
//   bun run check:actions
//
// The counterpart to `check:deps`, on the axis a lockfile cannot see. Every
// `uses:` line in `.github/workflows/` is a dependency with a version, and
// nothing in this repo has ever looked at one. `actions/checkout@v4` sitting on
// an end-of-life Node was found by an annotation on a green run, which is to
// say by luck: the run passed, the notice scrolled past, and the only reason it
// was noticed at all is that somebody happened to open the log.
//
// Two questions per action, and they are the two a person can act on:
//
//   - Is the repository archived? An archived action is not coming back.
//   - Is the pinned major behind the latest released major? A major is where
//     an action moves its runtime, which is exactly what the checkout notice
//     was about.
//
// A pinned SHA is reported and not judged. That is the supply-chain-safe way to
// pin one, it carries no readable version, and telling somebody their SHA is
// out of date without knowing which release it belongs to would be noise.
//
// Reads the live GitHub API, so this can go red on a morning when nothing in
// the repo changed. That is why it is its own job beside `check:deps` rather
// than part of `check`.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Behind on purpose, with the reason and what would end it.
 *
 * Hand-maintained, like `check:deps`'s own list. Adding a line is the
 * deliberate part: it goes through review with a reason attached.
 */
const ALLOWED: Record<string, string> = {
  // ("owner/repo": why the older major is still here, and what would let it go)
};

const DIR = "../.github/workflows";
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

interface Use {
  action: string;
  ref: string;
  where: string;
}

/** Every `uses:` in every workflow, with the file it came from. */
async function usages(): Promise<Use[]> {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  const out: Use[] = [];
  for (const file of files) {
    const text = await readFile(path.join(DIR, file), "utf8");
    for (const line of text.split("\n")) {
      // `uses: owner/repo@ref`, ignoring local (./) and docker (docker://) uses,
      // which have no releases to be behind.
      const found = /^\s*(?:-\s*)?uses:\s*([\w.-]+\/[\w.-]+)@([^\s#]+)/.exec(line);
      if (found) out.push({ action: found[1], ref: found[2], where: file });
    }
  }
  return out;
}

async function gh<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "90x-check-actions",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.status === 404) return null;
  if (response.status === 403 || response.status === 429) {
    throw new Error(`GitHub answered ${response.status}. Unauthenticated calls are rate limited; set GITHUB_TOKEN.`);
  }
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${url}`);
  return (await response.json()) as T;
}

/** The major in a ref like `v4`, `v4.2.1` or `4`. Null for a SHA or a branch. */
function majorOf(ref: string): number | null {
  const found = /^v?(\d+)(?:\.\d+)*$/.exec(ref);
  return found ? Number(found[1]) : null;
}

const uses = await usages();
const seen = new Map<string, Use[]>();
for (const u of uses) {
  const list = seen.get(u.action) ?? [];
  list.push(u);
  seen.set(u.action, list);
}

const behind: { action: string; pinned: string; latest: string; where: string }[] = [];
const archived: string[] = [];
let pinnedBySha = 0;

for (const [action, where] of seen) {
  const refs = [...new Set(where.map((w) => w.ref))];
  const files = [...new Set(where.map((w) => w.where))].join(", ");

  const repo = await gh<{ archived?: boolean }>(`https://api.github.com/repos/${action}`);
  if (!repo) {
    console.log(`GONE       ${action}  no such repository`);
    archived.push(action);
    continue;
  }
  if (repo.archived === true) {
    console.log(`ARCHIVED   ${action}  used in ${files}`);
    archived.push(action);
    continue;
  }

  const release = await gh<{ tag_name?: string }>(`https://api.github.com/repos/${action}/releases/latest`);
  const latest = release?.tag_name ?? null;
  const latestMajor = latest ? majorOf(latest) : null;

  for (const ref of refs) {
    const pinned = majorOf(ref);
    if (pinned === null) {
      // A SHA or a branch. Reported, never judged: see the note at the top.
      console.log(`pinned     ${action}@${ref}  not a version, not checked`);
      pinnedBySha += 1;
      continue;
    }
    if (latestMajor === null) {
      console.log(`unknown    ${action}@${ref}  no published release to compare`);
      continue;
    }
    if (pinned < latestMajor) {
      console.log(`BEHIND     ${action}@${ref}  latest is ${latest}, used in ${files}`);
      behind.push({ action, pinned: ref, latest: latest!, where: files });
    } else {
      console.log(`ok         ${action}@${ref}  latest is ${latest}`);
    }
  }
}

const unexpected = [...behind.filter((b) => !(b.action in ALLOWED)), ...archived.filter((a) => !(a in ALLOWED))];

for (const name of Object.keys(ALLOWED)) {
  if (behind.some((b) => b.action === name) || archived.includes(name)) {
    console.log(`allowed    ${name}  kept because: ${ALLOWED[name]}`);
  }
}

if (unexpected.length === 0) {
  console.log(
    `\n${seen.size} action(s) across ${new Set(uses.map((u) => u.where)).size} workflow(s), nothing behind a major or archived${pinnedBySha > 0 ? `, ${pinnedBySha} pinned by SHA` : ""}.`,
  );
  process.exit(0);
}

console.log(`\n${unexpected.length} action(s) behind or gone. Bump it, or add it to ALLOWED in this file with a reason.`);
process.exit(1);
