// The e2e dataset, shared by scripts/seed-e2e.ts (writes it) and the specs
// (read answers from it). Fixed ids and slugs keep the seed idempotent.

export const SOURCE = { id: "e2e", name: "E2E fixtures", domain: "dsa", role: "cards" } as const;

type Topic = { slug: string; domain: string; name: string; importance: number; sort: number };

export const TOPICS: Topic[] = [
  { slug: "e2e-arrays", domain: "dsa", name: "Arrays & Hashing", importance: 1, sort: 1 },
  { slug: "e2e-two-pointers", domain: "dsa", name: "Two Pointers", importance: 0.9, sort: 2 },
  { slug: "e2e-stack", domain: "dsa", name: "Stack", importance: 0.8, sort: 3 },
  { slug: "e2e-caching", domain: "system_design", name: "Caching", importance: 0.9, sort: 1 },
  // Two more design topics, so the mock picker's search has something to choose between
  // and the "Design a " prefix gets exercised: the box shows "URL shortener" while the
  // form must post the full name, because startMock refuses a topic that is not one of
  // designTopics(). Importance stays below Caching's so it remains the default and the
  // specs that rely on that keep holding.
  { slug: "e2e-url-shortener", domain: "system_design", name: "Design a URL shortener", importance: 0.85, sort: 2 },
  { slug: "e2e-rate-limiter", domain: "system_design", name: "Design a rate limiter", importance: 0.8, sort: 3 },
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
  /** The primitive id, stored in `cards.format`. */
  primitive: "pick_one" | "self_rate";
  /** The archetype id, stored in `cards.archetype`. */
  archetype: string;
  difficulty: "Easy" | "Medium" | "Hard";
  /** Plain text (no Markdown), so a spec can find it on the page as rendered. */
  promptMd: string;
  answerMd: string;
  keyPoints: string[];
  /** pick_one only: the choices. */
  options?: string[];
  /** pick_one only: the correct option index, stored in `cards.picked`. */
  picked?: number[];
};

const cardId = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const LIVE_CARDS: SeedCard[] = [
  // Options are chosen for shape, not volume.
  {
    id: cardId(1),
    topicSlug: "e2e-caching",
    primitive: "pick_one",
    archetype: "concept",
    difficulty: "Easy",
    promptMd: "Which eviction policy removes the entry used longest ago?",
    answerMd: "LRU evicts the entry used least recently; LFU evicts the least frequently used.",
    keyPoints: ["LRU", "LFU"],
    options: ["LRU", "LFU", "FIFO", "Random"],
    picked: [0],
  },
  {
    id: cardId(2),
    topicSlug: "e2e-caching",
    primitive: "pick_one",
    archetype: "concept",
    difficulty: "Easy",
    promptMd: "What does write-through caching do on every write?",
    answerMd: "It writes to the cache and the database in the same operation.",
    keyPoints: ["cache", "database"],
    options: [
      "Writes to the cache only",
      "Writes to the cache and the database",
      "Writes to the database only",
      "Writes to disk later, asynchronously",
    ],
    picked: [1],
  },
  {
    id: cardId(3),
    topicSlug: "e2e-arrays",
    primitive: "pick_one",
    archetype: "concept",
    difficulty: "Easy",
    promptMd: "How does a hash map make Two Sum run in linear time?",
    answerMd: "Store each value's index in a hash map and look up the complement in one pass.",
    keyPoints: ["hash map", "complement", "one pass"],
    options: [
      "Sort the array and binary search each complement",
      "Store each value's index and look up the complement in one pass",
      "Use two nested loops over every pair",
      "Build a max heap of the values",
    ],
    picked: [1],
  },
  {
    id: cardId(4),
    topicSlug: "e2e-two-pointers",
    primitive: "pick_one",
    archetype: "which-approach",
    difficulty: "Medium",
    promptMd: "When do two pointers solve a pair-sum problem without extra memory?",
    answerMd: "When the array is sorted: move the left pointer up or the right pointer down depending on the sum.",
    keyPoints: ["sorted", "left", "right"],
    options: [
      "When the array is unsorted and the pairs are far apart",
      "When the array is sorted",
      "When the array holds only distinct values",
      "When the target is negative",
    ],
    picked: [1],
  },
  {
    id: cardId(5),
    topicSlug: "e2e-stack",
    primitive: "pick_one",
    archetype: "output-prediction",
    difficulty: "Easy",
    promptMd: "What does Python print for len(set([1, 1, 2]))?",
    answerMd: "2: the set removes the duplicate 1, leaving two elements.",
    keyPoints: ["2"],
    options: ["1", "2", "3", "It raises an error"],
    picked: [1],
  },
  {
    id: cardId(6),
    topicSlug: "e2e-processes",
    primitive: "pick_one",
    archetype: "concept",
    difficulty: "Medium",
    promptMd: "What do threads of one process share that separate processes do not?",
    answerMd: "Threads share the address space (heap and globals); each thread has its own stack.",
    keyPoints: ["address space", "stack"],
    options: ["The address space (heap and globals)", "Their own instruction pointer", "Their own stack", "Their own page tables"],
    picked: [0],
  },
  {
    id: cardId(7),
    topicSlug: "e2e-processes",
    primitive: "pick_one",
    archetype: "which-is-not-true",
    difficulty: "Hard",
    promptMd: "Which is NOT one of the four conditions for a deadlock?",
    answerMd:
      "The four conditions are mutual exclusion, hold and wait, no preemption and circular wait. Priority inversion is not one of them.",
    keyPoints: ["mutual exclusion", "hold and wait", "no preemption", "circular wait"],
    options: ["Mutual exclusion", "Hold and wait", "Circular wait", "Priority inversion"],
    picked: [3],
  },
  {
    id: cardId(8),
    topicSlug: "e2e-collections",
    primitive: "pick_one",
    archetype: "concept",
    difficulty: "Easy",
    promptMd: "What does a Java HashMap need from its keys to work correctly?",
    answerMd: "Consistent equals and hashCode implementations.",
    keyPoints: ["equals", "hashCode"],
    options: [
      "Consistent equals and hashCode implementations",
      "Keys that implement Comparable",
      "Keys stored in insertion order",
      "A fixed capacity set up front",
    ],
    picked: [0],
  },
  {
    id: cardId(9),
    topicSlug: "e2e-collections",
    primitive: "pick_one",
    archetype: "concept",
    difficulty: "Medium",
    promptMd: "Which Java list gives constant-time access by index?",
    answerMd: "ArrayList is a resizable array, so index access is O(1); LinkedList walks from the ends.",
    keyPoints: ["ArrayList", "LinkedList"],
    options: ["ArrayList", "LinkedList", "Both", "Neither"],
    picked: [0],
  },
  {
    id: cardId(10),
    topicSlug: "e2e-joins",
    primitive: "pick_one",
    archetype: "concept",
    difficulty: "Easy",
    promptMd: "Which join keeps every row of the left table even without a match?",
    answerMd: "A LEFT JOIN, which fills the right side with NULL where nothing matches.",
    keyPoints: ["left join", "null"],
    options: ["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "CROSS JOIN"],
    picked: [1],
  },
  {
    id: cardId(11),
    topicSlug: "e2e-joins",
    primitive: "self_rate",
    archetype: "flash",
    difficulty: "Easy",
    promptMd: "Do you know what an INNER JOIN returns?",
    answerMd: "An INNER JOIN returns only the rows that have a match in both tables.",
    keyPoints: ["match", "both"],
  },
  {
    id: cardId(12),
    topicSlug: "e2e-caching",
    primitive: "self_rate",
    archetype: "flash",
    difficulty: "Easy",
    promptMd: "Do you know how cache eviction works?",
    answerMd:
      "Eviction decides which entry to drop when the cache is full: LRU drops the least recently used, LFU the least frequently used.",
    keyPoints: ["LRU", "LFU"],
  },
];

export const DRAFT_CARDS: SeedCard[] = [
  {
    id: cardId(101),
    topicSlug: "e2e-caching",
    primitive: "pick_one",
    archetype: "concept",
    difficulty: "Medium",
    promptMd: "What is a cache stampede and one way to prevent it?",
    answerMd: "Many requests miss the same key at once and all hit the store; a lock or request coalescing prevents it.",
    keyPoints: ["miss", "lock"],
    options: [
      "One request misses and recomputes alone",
      "Many requests miss the same key at once and all hit the store",
      "The cache evicts its hottest key",
      "The store rejects reads under load",
    ],
    picked: [1],
  },
  {
    id: cardId(102),
    topicSlug: "e2e-caching",
    primitive: "pick_one",
    archetype: "concept",
    difficulty: "Easy",
    promptMd: "What does a CDN cache?",
    answerMd: "Static content close to users, at edge locations.",
    keyPoints: ["static", "edge"],
    options: ["Static content close to users at edge locations", "Database query results", "User session state", "WebSocket connections"],
    picked: [0],
  },
];

/** The correct option index for a pick_one card, or -1 for a self_rate card. */
export function correctOption(card: SeedCard): number {
  return card.primitive === "pick_one" ? (card.picked?.[0] ?? -1) : -1;
}

// One trick on the seeded arrays pattern, tied to two-sum, so the problem page's
// "Tricks it uses" section is testable. Appended by unit 3 (problem-page); it also
// shows on the e2e-arrays pattern page.
export const TRICKS = [
  {
    id: "e2e-trick-two-sum",
    patternSlug: "e2e-arrays",
    name: "One-pass hash map",
    ideaMd: "Store each value's index as you go, then look up the complement once.",
    problemSlugs: ["two-sum"],
    sort: 1,
  },
];

// --- Weekly-review fixtures (the Coach's read on Today) ----------------------
//
// A weekly review is written by the Sunday job from a model call, so no UI path
// creates one, and the card on Today can only be tested against seeded rows. Each
// review has a fixed id and a fixed weekStart: the card's per-device dismissal is
// keyed by weekStart, so the spec needs two different weeks to prove that
// dismissing the old one does not hide the new one.
//
// Three users carry the states the card has to handle: one undecided review, a
// later review beside an earlier one, and a review already decided. The emails are
// fixed (unlike helpers.signIn's random address) because scripts/seed-e2e.ts has
// to create the auth users the reviews hang off, and the spec signs in as them.

export type WeeklyReviewFixture = {
  id: string;
  weekStart: string;
  formulaScore: number;
  coachScore: number;
  /** Plain text, so a spec finds it on the page exactly as rendered. */
  summaryMd: string;
  accepted: boolean | null;
  suggestedChanges: { weekday: number; slot: "new_problem" | "review" | "topic" | "cards"; from: number; to: number; why: string }[];
};

export type WeeklyUserFixture = { email: string; reviews: WeeklyReviewFixture[] };

export const WEEKLY_USERS: WeeklyUserFixture[] = [
  {
    email: "weekly-read@e2e.test",
    reviews: [
      {
        id: "e2e00000-0000-4000-8000-000000000101",
        weekStart: "2026-09-14",
        formulaScore: 61,
        coachScore: 68,
        summaryMd: "You held the streak but leaned on hints for graphs.",
        accepted: null,
        suggestedChanges: [
          { weekday: 1, slot: "review", from: 1, to: 2, why: "Reviews keep slipping." },
          { weekday: 3, slot: "cards", from: 0, to: 1, why: "Two card sets went unread." },
        ],
      },
    ],
  },
  {
    email: "weekly-new@e2e.test",
    reviews: [
      {
        id: "e2e00000-0000-4000-8000-000000000102",
        weekStart: "2026-09-14",
        formulaScore: 63,
        coachScore: 66,
        summaryMd: "An earlier read that the newer one replaces.",
        accepted: null,
        suggestedChanges: [{ weekday: 1, slot: "review", from: 1, to: 2, why: "Reviews keep slipping." }],
      },
      {
        id: "e2e00000-0000-4000-8000-000000000103",
        weekStart: "2026-09-21",
        formulaScore: 68,
        coachScore: 74,
        summaryMd: "The newer read, and the one the card should show.",
        accepted: null,
        suggestedChanges: [
          { weekday: 2, slot: "new_problem", from: 2, to: 3, why: "Two mediums landed last week." },
          { weekday: 5, slot: "topic", from: 0, to: 1, why: "Design needs the repetition." },
        ],
      },
    ],
  },
  {
    email: "weekly-decided@e2e.test",
    reviews: [
      {
        id: "e2e00000-0000-4000-8000-000000000104",
        weekStart: "2026-09-21",
        formulaScore: 55,
        coachScore: 58,
        summaryMd: "A read you have already answered.",
        accepted: true,
        suggestedChanges: [{ weekday: 6, slot: "topic", from: 1, to: 0, why: "Weekends went to mocks." }],
      },
    ],
  },
];
