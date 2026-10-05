// Uncontended (1 user, sequential) latency per page, to separate service time from queueing:
//   bun scripts/load/probe.ts [n=20]
import { BASE, pct, signIn, timedGet } from "./lib";

const n = Number(process.argv[2] ?? 20);
const cookie = await signIn(`probe${Date.now() % 1000000}`);
await timedGet("/today", cookie); // plans the day
for (const p of ["/", "/today", "/feed", "/library", "/me", "/coach"]) {
  const ms: number[] = [];
  for (let i = 0; i < n; i++) ms.push((await timedGet(p, p === "/" ? undefined : cookie)).ms);
  ms.sort((a, b) => a - b);
  console.log(`${p.padEnd(10)} p50=${pct(ms, 50).toFixed(0)}ms p95=${pct(ms, 95).toFixed(0)}ms  (${BASE})`);
}
