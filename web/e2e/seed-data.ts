// The e2e dataset, shared by scripts/seed-e2e.ts (writes it) and the specs
// (read answers from it). Fixed ids and slugs keep the seed idempotent.

export const SOURCE = { id: "e2e", name: "E2E fixtures", domain: "dsa", role: "cards" } as const;

type Topic = { slug: string; domain: string; name: string; importance: number; sort: number };

export const TOPICS: Topic[] = [
  { slug: "e2e-arrays", domain: "dsa", name: "Arrays & Hashing", importance: 1, sort: 1 },
  { slug: "e2e-two-pointers", domain: "dsa", name: "Two Pointers", importance: 0.9, sort: 2 },
  { slug: "e2e-stack", domain: "dsa", name: "Stack", importance: 0.8, sort: 3 },
  { slug: "e2e-caching", domain: "system_design", name: "Caching", importance: 0.9, sort: 1 },
  { slug: "e2e-processes", domain: "cs", name: "Processes and threads", importance: 0.7, sort: 1 },
  { slug: "e2e-collections", domain: "java", name: "Collections", importance: 0.6, sort: 1 },
  { slug: "e2e-joins", domain: "sql", name: "Joins", importance: 0.6, sort: 1 },
];

export const TOPIC_LINKS = [
  { fromSlug: "e2e-arrays", toSlug: "e2e-two-pointers" },
  { fromSlug: "e2e-arrays", toSlug: "e2e-stack" },
];

// A small system-design roadmap, so the Library's Roadmap view has something to draw.
// Roadmap nodes are catalog content in production, which means a CI database
// has none of them and the view would be untestable without these.
//
// The shape matters more than the content: one topic that has a lesson (so a node can
// link somewhere), one that does not (so a node renders dashed and labelled "soon"),
// and a subtopic (so the graph has a branch off its spine). e2e-caching is the only
// seeded system_design topic with a lesson.
//
// `id` is text, keyed "<roadmap>:<node>"; the e2e: prefix keeps these clear of the rows
// check-tracker.ts inserts in its own rolled-back transaction.
export const ROADMAP_NODES = [
  {
    id: "e2e:sd-caching",
    roadmap: "system-design",
    domain: "system_design",
    label: "Caching",
    kind: "topic",
    sort: 1,
    topicSlug: "e2e-caching",
  },
  {
    id: "e2e:sd-eviction",
    roadmap: "system-design",
    domain: "system_design",
    label: "Cache eviction",
    kind: "subtopic",
    sort: 2,
    topicSlug: null,
  },
  { id: "e2e:sd-sharding", roadmap: "system-design", domain: "system_design", label: "Sharding", kind: "topic", sort: 3, topicSlug: null },
];

type Problem = {
  slug: string;
  lcNumber: number;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  patternSlug: string;
  importance: number;
};

export const PROBLEMS: Problem[] = [
  { slug: "two-sum", lcNumber: 1, title: "Two Sum", difficulty: "Easy", patternSlug: "e2e-arrays", importance: 0.9 },
  {
    slug: "contains-duplicate",
    lcNumber: 217,
    title: "Contains Duplicate",
    difficulty: "Easy",
    patternSlug: "e2e-arrays",
    importance: 0.8,
  },
  { slug: "valid-anagram", lcNumber: 242, title: "Valid Anagram", difficulty: "Easy", patternSlug: "e2e-arrays", importance: 0.7 },
  { slug: "group-anagrams", lcNumber: 49, title: "Group Anagrams", difficulty: "Medium", patternSlug: "e2e-arrays", importance: 0.6 },
  {
    slug: "top-k-frequent-elements",
    lcNumber: 347,
    title: "Top K Frequent Elements",
    difficulty: "Medium",
    patternSlug: "e2e-arrays",
    importance: 0.5,
  },
  {
    slug: "valid-palindrome",
    lcNumber: 125,
    title: "Valid Palindrome",
    difficulty: "Easy",
    patternSlug: "e2e-two-pointers",
    importance: 0.9,
  },
  {
    slug: "two-sum-ii-input-array-is-sorted",
    lcNumber: 167,
    title: "Two Sum II - Input Array Is Sorted",
    difficulty: "Medium",
    patternSlug: "e2e-two-pointers",
    importance: 0.8,
  },
  { slug: "3sum", lcNumber: 15, title: "3Sum", difficulty: "Medium", patternSlug: "e2e-two-pointers", importance: 0.7 },
  {
    slug: "container-with-most-water",
    lcNumber: 11,
    title: "Container With Most Water",
    difficulty: "Medium",
    patternSlug: "e2e-two-pointers",
    importance: 0.6,
  },
  {
    slug: "trapping-rain-water",
    lcNumber: 42,
    title: "Trapping Rain Water",
    difficulty: "Hard",
    patternSlug: "e2e-two-pointers",
    importance: 0.5,
  },
];

export const statementOf = (p: Problem) => `Solve **${p.title}**. This is an e2e fixture, not the real statement.`;
export const solutionOf = (p: Problem) => `class Solution:\n    def solve(self):\n        # ${p.title}\n        return None\n`;

export const LESSON = {
  topicSlug: "e2e-caching",
  title: "Caching",
  summary: "A cache keeps hot data close to the reader.",
  bodyMd: [
    "A cache keeps hot data close to the reader, trading staleness for latency.",
    "",
    "## Key points",
    "",
    "- Pick an eviction policy: LRU for recency, LFU for frequency.",
    "- Decide how writes reach the store: write-through, write-back, or write-around.",
  ].join("\n"),
  practice: { problems: [], questions: [] },
  words: 42,
};

export const LIVE_BATCH = {
  id: "e2e00000-0000-4000-8000-00000000b001",
  domain: "cs",
  label: "E2E live cards",
  status: "published",
} as const;
export const DRAFT_BATCH = {
  id: "e2e00000-0000-4000-8000-00000000b002",
  domain: "system_design",
  label: "E2E draft batch",
  status: "draft",
} as const;

export type SeedCard = {
  id: string;
  topicSlug: string;
  format: "typed" | "mcq" | "output";
  difficulty: "Easy" | "Medium" | "Hard";
  /** Plain text (no Markdown), so a spec can find it on the page as rendered. */
  promptMd: string;
  answerMd: string;
  keyPoints: string[];
  options?: string[];
};

const cardId = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const LIVE_CARDS: SeedCard[] = [
  {
    id: cardId(1),
    topicSlug: "e2e-caching",
    format: "typed",
    difficulty: "Medium",
    promptMd: "Name two cache eviction policies and when a cache entry goes stale.",
    answerMd: "LRU and LFU evict entries; an entry goes stale when its TTL expires or the source changes.",
    keyPoints: ["LRU", "LFU", "TTL"],
  },
  {
    id: cardId(2),
    topicSlug: "e2e-caching",
    format: "typed",
    difficulty: "Easy",
    promptMd: "What does write-through caching do on every write?",
    answerMd: "It writes to the cache and the database in the same operation.",
    keyPoints: ["cache", "database"],
  },
  {
    id: cardId(3),
    topicSlug: "e2e-caching",
    format: "mcq",
    difficulty: "Easy",
    promptMd: "Which eviction policy removes the entry used longest ago?",
    answerMd: "LRU",
    keyPoints: ["LRU"],
    options: ["LRU", "LFU", "FIFO", "Random"],
  },
  {
    id: cardId(4),
    topicSlug: "e2e-arrays",
    format: "typed",
    difficulty: "Easy",
    promptMd: "How does a hash map make Two Sum run in linear time?",
    answerMd: "Store each value's index in a hash map and look up the complement in one pass.",
    keyPoints: ["hash map", "complement", "one pass"],
  },
  {
    id: cardId(5),
    topicSlug: "e2e-two-pointers",
    format: "typed",
    difficulty: "Medium",
    promptMd: "When do two pointers solve a pair-sum problem without extra memory?",
    answerMd: "When the array is sorted: move the left pointer up or the right pointer down depending on the sum.",
    keyPoints: ["sorted", "left", "right"],
  },
  {
    id: cardId(6),
    topicSlug: "e2e-stack",
    format: "output",
    difficulty: "Easy",
    promptMd: "What does Python print for len(set([1, 1, 2]))?",
    answerMd: "2",
    keyPoints: ["2"],
  },
  {
    id: cardId(7),
    topicSlug: "e2e-processes",
    format: "typed",
    difficulty: "Medium",
    promptMd: "What do threads of one process share that separate processes do not?",
    answerMd: "Threads share the address space (heap and globals); each thread has its own stack.",
    keyPoints: ["address space", "stack"],
  },
  {
    id: cardId(8),
    topicSlug: "e2e-processes",
    format: "typed",
    difficulty: "Hard",
    promptMd: "Name the four conditions for a deadlock.",
    answerMd: "Mutual exclusion, hold and wait, no preemption and circular wait.",
    keyPoints: ["mutual exclusion", "hold and wait", "no preemption", "circular wait"],
  },
  {
    id: cardId(9),
    topicSlug: "e2e-collections",
    format: "typed",
    difficulty: "Easy",
    promptMd: "What does a Java HashMap need from its keys to work correctly?",
    answerMd: "Consistent equals and hashCode implementations.",
    keyPoints: ["equals", "hashCode"],
  },
  {
    id: cardId(10),
    topicSlug: "e2e-collections",
    format: "typed",
    difficulty: "Medium",
    promptMd: "Which Java list gives constant-time access by index, and which constant-time insertion at the head?",
    answerMd: "ArrayList for index access, LinkedList for insertion at the head.",
    keyPoints: ["ArrayList", "LinkedList"],
  },
  {
    id: cardId(11),
    topicSlug: "e2e-joins",
    format: "typed",
    difficulty: "Easy",
    promptMd: "Which join keeps every row of the left table even without a match?",
    answerMd: "A LEFT JOIN, which fills the right side with NULL where nothing matches.",
    keyPoints: ["left join", "null"],
  },
  {
    id: cardId(12),
    topicSlug: "e2e-joins",
    format: "typed",
    difficulty: "Medium",
    promptMd: "What does an INNER JOIN return?",
    answerMd: "Only the rows that have a match in both tables.",
    keyPoints: ["match", "both"],
  },
];

export const DRAFT_CARDS: SeedCard[] = [
  {
    id: cardId(101),
    topicSlug: "e2e-caching",
    format: "typed",
    difficulty: "Medium",
    promptMd: "What is a cache stampede and one way to prevent it?",
    answerMd: "Many requests miss the same key at once and all hit the store; a lock or request coalescing prevents it.",
    keyPoints: ["miss", "lock"],
  },
  {
    id: cardId(102),
    topicSlug: "e2e-caching",
    format: "typed",
    difficulty: "Easy",
    promptMd: "What does a CDN cache?",
    answerMd: "Static content close to users, at edge locations.",
    keyPoints: ["static", "edge"],
  },
];

/** An answer the grader marks fully correct without AI (exact or every key point, output compared as text). */
export function correctAnswer(card: SeedCard): string {
  if (card.format === "typed") return card.keyPoints.join(", ");
  return card.answerMd;
}
