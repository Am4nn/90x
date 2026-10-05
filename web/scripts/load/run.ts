// Local load test runner. See README.md. LOCAL ONLY (test sign-in route + local DB).
//
//   bun scripts/load/run.ts [scenario|all] [--vus 25,50,100] [--seconds 60] [--users 100]
//
// Scenarios: landing, pages (today/feed/library/me/coach, one at a time), today-cold
// (first open of the day for fresh users, the write path), feed (load /feed, then loop
// getNextCard + submitAnswer as server-action POSTs), mixed (a realistic blend).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { BASE, row, runScenario, type Sample, sampleDb, signInMany, summarize, timedGet, type Stats } from "./lib";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const args = process.argv.slice(2);
const flag = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return (i >= 0 ? args[i + 1] : undefined) ?? dflt;
};
const first = args[0];
const which = first && !first.startsWith("--") ? first : "all";
const VUS = flag("vus", "25,50,100").split(",").map(Number);
const SECONDS = Number(flag("seconds", "60"));
const USERS = Number(flag("users", String(Math.max(...VUS))));
const RUN = Date.now() % 1000000; // fresh users per run: the Feed allowance is 300 actions/hour/user
const PAGES = ["/today", "/feed", "/library", "/me", "/coach"];

// ---- server actions: ids live in the client chunks as createServerReference("<id>", ..., "<name>") ----
function actionIds(): Record<string, string> {
  const ids: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) {
        const text = readFileSync(p, "utf8");
        for (const m of text.matchAll(/createServerReference\)?\(\s*"([0-9a-f]{40,})"[^)]*?"(\w+)"\s*\)/g)) {
          const [, id, name] = m;
          if (id && name) ids[name] = id;
        }
      }
    }
  };
  walk(join(HERE, "../../.next/static"));
  return ids;
}

async function action(id: string, cookie: string, body: unknown): Promise<{ sample: Sample; text: string }> {
  const t = performance.now();
  try {
    const res = await fetch(`${BASE}/feed`, {
      method: "POST",
      headers: { cookie, "next-action": id, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    // Actions return their own { error } instead of throwing; count those as failures too.
    const failed = !res.ok || /"error":"/.test(text);
    return { sample: { ms: performance.now() - t, status: res.status, ok: !failed }, text };
  } catch (e) {
    return { sample: { ms: performance.now() - t, status: 0, ok: false, err: String(e) }, text: "" };
  }
}

/** Pulls the first JSON object out of a flight response line `1:{...}` that has a `card`. */
type CardShape = { id: string; primitive: string | null; options: unknown; numeric: unknown };

function cardFrom(text: string): CardShape | null {
  const m = text.match(/"card":(\{[\s\S]*?"diagnostic":(?:null|\{[^}]*\})\})/);
  const json = m?.[1];
  if (!json) return null;
  try {
    return JSON.parse(json) as CardShape;
  } catch {
    return null;
  }
}

function answerFor(card: CardShape) {
  switch (card.primitive) {
    case "compose":
      return { cardId: card.id, answer: "It trades memory for speed by keeping a hash map of what it has seen." };
    case "numeric":
      return { cardId: card.id, shape: "number", value: 1 };
    case "pick_one":
    case "pick_many":
    case "tap_in_place":
      return { cardId: card.id, shape: "chosen", picked: [0] };
    default:
      return { cardId: card.id, declare: "new_to_me" };
  }
}

async function feedLoop(ids: Record<string, string>, cookie: string, withPageLoad: boolean): Promise<Sample[]> {
  const out: Sample[] = [];
  if (withPageLoad) out.push(await timedGet("/feed", cookie));
  const getNextCard = ids.getNextCard;
  const submitAnswer = ids.submitAnswer;
  if (!getNextCard || !submitAnswer) throw new Error("server action ids missing");
  let r = await action(getNextCard, cookie, []);
  out.push(r.sample);
  let card = cardFrom(r.text);
  for (let i = 0; i < 3 && card; i++) {
    r = await action(submitAnswer, cookie, [answerFor(card), { preload: true }]);
    out.push(r.sample);
    card = cardFrom(r.text);
    await sleep(300 + Math.random() * 700); // reading time
  }
  return out;
}

const results: Stats[] = [];
async function record(s: Stats, db: { max: number }) {
  results.push({ ...s, dbMax: db.max } as Stats);
  console.log(row(s), `dbConnMax=${db.max}`);
}

/** Runs one scenario while sampling Postgres connection count every second. */
async function measured(name: string, vus: number, iteration: (vu: number) => Promise<Sample[]>, seconds = SECONDS) {
  let max = 0;
  const state = { stop: false };
  const sampler = (async () => {
    while (!state.stop) {
      max = Math.max(max, (await sampleDb().catch(() => ({ total: 0 }))).total);
      await sleep(1000);
    }
  })();
  const s = await runScenario(name, vus, seconds, iteration);
  state.stop = true;
  await sampler;
  await record(s, { max });
}

const run = (n: string) => which === "all" || which === n;

async function main() {
  console.log(`load test against ${BASE}, vus=${VUS} seconds=${SECONDS}`);
  const ids = actionIds();
  const need = ["getNextCard", "submitAnswer"];

  if (run("landing")) for (const v of VUS) await measured(`landing`, v, async () => [await timedGet("/")]);

  const needUsers = ["pages", "feed", "mixed"].some(run);
  let cookies: string[] = [];
  if (needUsers) {
    console.log(`signing in ${USERS} users`);
    cookies = await signInMany(`load${RUN}_`, USERS);
    // First /today does the day's planning write; do it once up front so "pages" measures steady state.
    await Promise.all(cookies.map((c) => timedGet("/today", c)));
  }

  if (run("pages"))
    for (const p of PAGES)
      for (const v of VUS) await measured(`page ${p}`, v, async (vu) => [await timedGet(p, cookies[vu % cookies.length])]);

  if (run("today-cold"))
    for (const v of VUS) {
      const fresh = await signInMany(`cold${RUN}_${v}_`, v);
      const samples = await Promise.all(fresh.map((c) => timedGet("/today", c)));
      const s = summarize("today-cold(first open)", v, Math.max(...samples.map((x) => x.ms)) / 1000, samples);
      results.push(s);
      console.log(row(s));
    }

  if (run("feed")) {
    for (const n of need) if (!ids[n]) throw new Error(`server action ${n} not found in .next/static (is the build here?)`);
    for (const v of VUS) {
      const fresh = await signInMany(`feed${RUN}_${v}_`, v);
      await measured(`feed loop`, v, (vu) => feedLoop(ids, fresh[vu] ?? "", true));
    }
  }

  if (run("mixed")) {
    for (const n of need) if (!ids[n]) throw new Error(`server action ${n} not found`);
    for (const v of VUS) {
      const fresh = await signInMany(`mix${RUN}_${v}_`, v);
      await measured(`mixed`, v, async (vu) => {
        const c = fresh[vu] ?? "";
        const roll = Math.random();
        if (roll < 0.4) return [await timedGet("/", undefined)];
        if (roll < 0.6) return [await timedGet("/today", c)];
        if (roll < 0.8) return [await timedGet("/library", c)];
        return feedLoop(ids, c, true);
      });
    }
  }

  const out = join(HERE, `results-${Date.now()}.json`);
  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`wrote ${out}`);
}

await main();
