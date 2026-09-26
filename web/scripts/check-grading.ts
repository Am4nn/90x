// Is the grading prompt still consistent? A fixed set of answers with the key
// points a fair grader should credit. Calls the real model (fractions of a cent);
// run by hand after changing the prompt or the model: bun run check:grading
import { gradeWithAi } from "@/lib/feed/grader";

const CASES = [
  {
    prompt: "Why does a HashMap have O(1) average lookup?",
    reference:
      "Keys are hashed to a bucket index, so a lookup jumps straight to one bucket; with a good hash and resizing, buckets stay short.",
    keyPoints: ["hash function maps the key to a bucket index", "direct access to the bucket, not a scan", "resizing keeps buckets short"],
    answers: [
      {
        text: "The key's hash picks the bucket directly, and the table grows when it gets full so each bucket holds few entries.",
        expect: 3,
      },
      { text: "Because it hashes the key to find the bucket.", expect: 2 },
      { text: "It keeps the keys sorted and does binary search.", expect: 0 },
    ],
  },
  {
    prompt: "What does a load balancer's health check do?",
    reference: "It probes each backend periodically and stops routing traffic to ones that fail, adding them back when they recover.",
    keyPoints: ["periodic probe of each backend", "unhealthy backends get no traffic", "recovered backends are added back"],
    answers: [
      { text: "It pings servers every few seconds and takes dead ones out of rotation until they respond again.", expect: 3 },
      { text: "It checks servers.", expect: 1 },
    ],
  },
  {
    prompt: "Difference between a process and a thread?",
    reference:
      "A process has its own address space; threads live inside a process and share its memory, so switching and communicating is cheaper.",
    keyPoints: ["process has its own memory/address space", "threads share the process's memory", "threads are cheaper to create/switch"],
    answers: [
      {
        text: "Threads share memory within one process; each process is isolated with its own address space. Thread switches are lighter.",
        expect: 3,
      },
      { text: "A thread is a small process.", expect: 0 },
    ],
  },
];

let off = 0;
let total = 0;
for (const c of CASES) {
  for (const a of c.answers) {
    const r = await gradeWithAi({ userId: null, prompt: c.prompt, answer: a.text, referenceAnswer: c.reference, keyPoints: c.keyPoints });
    total++;
    const got = "hits" in r ? r.hits.filter(Boolean).length : "self-mark";
    const ok = typeof got === "number" && Math.abs(got - a.expect) <= 1;
    if (!ok) off++;
    console.log(`${ok ? "ok  " : "FAIL"} ${got}/${c.keyPoints.length} (expected ~${a.expect})  ${a.text.slice(0, 60)}`);
  }
}
console.log(`\n${total - off}/${total} within one key point of the expected grade`);
process.exit(off > 1 ? 1 : 0);
