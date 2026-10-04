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
  primitive: "pick_one" | "tap_in_place" | "order" | "match" | "bucket" | "assemble" | "claim_grid" | "numeric" | "grid_toggle" | "compose";
  /** The archetype id, stored in `cards.archetype`. */
  archetype: string;
  difficulty: "Easy" | "Medium" | "Hard";
  /** Plain text (no Markdown), so a spec can find it on the page as rendered. */
  promptMd: string;
  answerMd: string;
  keyPoints: string[];
  /** list primitives (pick_one, tap_in_place, order, claim_grid): the choices,
   *  snippet lines, items or statements — the canonical `cards.options` list. */
  options?: string[];
  /** match: the left and right sides, `{ left, right }` in `cards.options`. */
  left?: string[];
  right?: string[];
  /** bucket: the items and column labels, `{ items, columns }`. */
  items?: string[];
  columns?: string[];
  /** assemble: the tokens and the pre-filled slots, `{ tokens, fixed }`.
   *  `fixed[i]` is the index into `tokens` shown in that slot, or null for a gap. */
  tokens?: string[];
  fixed?: (number | null)[];
  /** grid_toggle: the row and column labels, `{ rows, columns }`. */
  rows?: string[];
  /** pick_one and tap_in_place: the correct index; grid_toggle: the correct
   *  cells, row-major, stored in `cards.picked`. */
  picked?: number[];
  /** match / bucket / claim_grid: the correct one-to-one pairs, `cards.pairs`. */
  pairs?: [number, number][];
  /** order / assemble: the required `before` pairs, `cards.constraints`. */
  constraints?: { before: [number, number][] };
  /** numeric only: the expected value and the tolerance it is judged against. */
  value?: number;
  tolerance?: number;
  /** The why-step, present only on Hard cards: every reason, correct included. */
  whyStep?: { options: string[]; correct: number };
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
    primitive: "pick_one",
    archetype: "concept",
    difficulty: "Easy",
    promptMd: "What does an INNER JOIN return?",
    answerMd: "An INNER JOIN returns only the rows that have a match in both tables.",
    keyPoints: ["match", "both"],
    options: [
      "Only the rows that match in both tables",
      "Every row of the left table",
      "Every row of both tables",
      "Every pairing of rows",
    ],
    picked: [0],
  },
  {
    id: cardId(12),
    topicSlug: "e2e-caching",
    primitive: "pick_one",
    archetype: "concept",
    difficulty: "Easy",
    promptMd: "What does cache eviction decide?",
    answerMd:
      "Eviction decides which entry to drop when the cache is full: LRU drops the least recently used, LFU the least frequently used.",
    keyPoints: ["LRU", "LFU"],
    options: ["Which entry to drop when the cache is full", "How long an entry may live", "Where a key is stored", "When to write to disk"],
    picked: [0],
  },
  // For tap_in_place the snippet lines live in `options`, one string
  // per line, and the correct line index in `picked`.
  {
    id: cardId(13),
    topicSlug: "e2e-arrays",
    primitive: "tap_in_place",
    archetype: "tap-the-bug",
    difficulty: "Medium",
    promptMd: "This loop is meant to sum an array. Tap the line with the bug.",
    answerMd:
      "The condition reads one element past the end. The last valid index is one less than the length, so the loop must stop before it, not at it.",
    keyPoints: ["off-by-one", "strict less-than"],
    options: ["int sum = 0;", "for (int i = 0; i <= arr.length; i++) {", "  sum += arr[i];", "}"],
    picked: [1],
  },
  {
    id: cardId(14),
    topicSlug: "e2e-joins",
    primitive: "tap_in_place",
    archetype: "tap-the-bottleneck",
    difficulty: "Medium",
    promptMd: "This query plan joins users to orders. Tap the line that costs the most.",
    answerMd:
      "The sequential scan of users has no index to use, so it reads every row and dominates the cost. An index on the join key removes it.",
    keyPoints: ["Seq Scan", "index"],
    options: [
      "Hash Join  (cost=100.00..12012.00 rows=1000)",
      "  Hash  (cost=50.00..50.00 rows=100)",
      "  Seq Scan on users  (cost=0.00..12000.00 rows=100000)",
      "  Seq Scan on orders  (cost=0.00..800.00 rows=5000)",
    ],
    picked: [2],
  },
  // The mapping and ordering screens: these rows exercise order,
  // match, bucket, assemble (empty and templated) and claim grid. They hang off
  // the multi-card topics so the fresh queue still serves B's pick-one/self-rate
  // cards first and the mission test keeps its answerable first ten. Ids are
  // 201+ so they never collide with the tap-in-place rows (13+) in the shared
  // e2e database.
  {
    id: cardId(201),
    topicSlug: "e2e-caching",
    primitive: "order",
    archetype: "sequence",
    difficulty: "Easy",
    promptMd: "Put the steps of a cache-aside read in order.",
    answerMd: "Cache-aside reads the cache first; on a miss it reads the store, writes the value back to the cache, then returns it.",
    keyPoints: ["cache first", "write back", "return"],
    options: ["Read the cache", "On a miss, read the store", "Write the value back to the cache", "Return the value"],
    constraints: {
      before: [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    },
  },
  {
    id: cardId(202),
    topicSlug: "e2e-collections",
    primitive: "match",
    archetype: "term-meaning",
    difficulty: "Easy",
    promptMd: "Match each exception to what causes it.",
    answerMd:
      "ConcurrentModificationException fires when a collection is mutated while iterating; NullPointerException when you call into null; ClassCastException when you cast to an unrelated type.",
    keyPoints: ["modifying while iterating", "null", "wrong cast"],
    left: ["ConcurrentModificationException", "NullPointerException", "ClassCastException"],
    right: ["Mutating a collection while iterating", "Calling into null", "Casting to an unrelated type"],
    pairs: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
  },
  {
    id: cardId(203),
    topicSlug: "e2e-joins",
    primitive: "bucket",
    archetype: "two-way",
    difficulty: "Easy",
    promptMd: "Sort each SQL function: deterministic or not.",
    answerMd: "upper() is deterministic; now() and random() change between calls.",
    keyPoints: ["deterministic", "not"],
    items: ["upper()", "now()", "random()"],
    columns: ["Deterministic", "Not deterministic"],
    pairs: [
      [0, 0],
      [1, 1],
      [2, 1],
    ],
  },
  {
    id: cardId(204),
    topicSlug: "e2e-joins",
    primitive: "assemble",
    archetype: "fill-code-blank",
    difficulty: "Medium",
    promptMd: "Assemble the SQL that lists names from the users table.",
    answerMd: "SELECT name FROM users;",
    keyPoints: ["SELECT", "FROM"],
    tokens: ["SELECT", "name", "FROM", "users", ";"],
    constraints: {
      before: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
      ],
    },
  },
  {
    id: cardId(205),
    topicSlug: "e2e-joins",
    primitive: "assemble",
    archetype: "fill-clause",
    difficulty: "Medium",
    promptMd: "Fill in the two missing keywords.",
    answerMd: "SELECT name FROM users WHERE age > 18.",
    keyPoints: ["FROM", "WHERE"],
    tokens: ["SELECT", "name", "FROM", "users", "WHERE", "age", ">", "18"],
    fixed: [0, 1, null, 3, null, 5, 6, 7],
    constraints: {
      before: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 6],
        [6, 7],
      ],
    },
  },
  {
    id: cardId(206),
    topicSlug: "e2e-processes",
    primitive: "claim_grid",
    archetype: "all-that-apply",
    difficulty: "Medium",
    promptMd: "Mark each statement true or false.",
    answerMd: "Threads of one process share the address space but have their own stack. Separate processes have their own address space.",
    keyPoints: ["share address space", "own stack"],
    options: [
      "Threads of one process share the same address space",
      "Each thread has its own stack",
      "Separate processes share one address space",
    ],
    pairs: [
      [0, 1],
      [1, 1],
      [2, 0],
    ],
  },
  // The written-answer screen. Its key points are the rubric the model marks
  // against, one boolean each, so there are four of them rather than a summary.
  {
    id: cardId(19),
    topicSlug: "e2e-caching",
    primitive: "compose",
    archetype: "your-story",
    difficulty: "Medium",
    promptMd: "In two or three sentences, describe a time you fixed a slow page. Say what was slow, what you did, and the result.",
    answerMd:
      "Our product list took eight seconds to load. I added a cache in front of the catalogue query and set a short expiry. Load time dropped to under a second.",
    keyPoints: ["Names what was slow", "Says what the writer personally did", "Gives a measurable result", "Is two or three sentences"],
  },
  // C3 owns numeric, grid_toggle and the why-step. These sit on e2e-caching so
  // their turn numbers sort them after the pick-one cards and feed.spec.ts (which only
  // answers pick_one and self_rate) never meets them. Ids 15-18 leave
  // 13-14 (tap in place) and 201-206 (mapping, ordering) untouched.
  {
    id: cardId(15),
    topicSlug: "e2e-caching",
    primitive: "numeric",
    archetype: "estimate",
    difficulty: "Easy",
    promptMd: "A cache has 256 entries split evenly across 16 sets. How many entries are in each set?",
    answerMd: "256 entries across 16 sets is 16 per set.",
    keyPoints: ["16"],
    value: 16,
    tolerance: 0,
  },
  {
    id: cardId(16),
    topicSlug: "e2e-caching",
    primitive: "numeric",
    archetype: "estimate",
    difficulty: "Medium",
    promptMd: "A cache stores 1,000 entries of 2 KB each. What is the total size, in megabytes?",
    answerMd: "1,000 x 2 KB is 2,000 KB, which is about 2 MB.",
    keyPoints: ["2"],
    value: 2,
    tolerance: 0.5,
  },
  {
    id: cardId(17),
    topicSlug: "e2e-caching",
    primitive: "grid_toggle",
    archetype: "method-semantics",
    difficulty: "Medium",
    promptMd: "Tick the cells that hold for each HTTP method.",
    answerMd: "GET is safe, idempotent and cacheable. PUT and DELETE are idempotent but not safe or cacheable.",
    keyPoints: ["safe", "idempotent", "cacheable"],
    rows: ["GET", "PUT", "DELETE"],
    columns: ["Safe", "Idempotent", "Cacheable"],
    picked: [0, 1, 2, 4, 7],
  },
  {
    id: cardId(18),
    topicSlug: "e2e-caching",
    primitive: "numeric",
    archetype: "estimate",
    difficulty: "Hard",
    promptMd: "A cache serves 10,000 requests per second and each spends 0.5 ms in the cache. How many requests are in the cache at once?",
    answerMd: "Little's law: 10,000 requests per second times 0.0005 seconds is 5 requests in flight.",
    keyPoints: ["5"],
    value: 5,
    tolerance: 0.5,
    whyStep: {
      options: [
        "Little's law: throughput times latency, 10,000 per second times 0.0005 seconds.",
        "10,000 divided by 0.5.",
        "0.5 times 10,000, but kept in milliseconds.",
        "Half of 10,000, then subtract the latency.",
      ],
      correct: 0,
    },
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
  // One draft card per primitive, so the
  // /admin/cards review screen shows every shape a reviewer must be able to
  // judge: tap in place, order, match, bucket, assemble, claim grid, numeric
  // (with a why-step) and grid toggle. Ids 103+ never collide with the live
  // cards (1-18, 201-206) in the shared e2e database.
  {
    id: cardId(103),
    topicSlug: "e2e-caching",
    primitive: "tap_in_place",
    archetype: "tap-the-bug",
    difficulty: "Medium",
    promptMd: "This loop is meant to sum an array. Tap the line with the bug.",
    answerMd:
      "The condition reads one element past the end. The last valid index is one less than the length, so the loop must stop before it, not at it.",
    keyPoints: ["off-by-one", "strict less-than"],
    options: ["int sum = 0;", "for (int i = 0; i <= arr.length; i++) {", "  sum += arr[i];", "}"],
    picked: [1],
  },
  {
    id: cardId(104),
    topicSlug: "e2e-caching",
    primitive: "order",
    archetype: "sequence",
    difficulty: "Easy",
    promptMd: "Put the steps of a cache-aside read in order.",
    answerMd: "Cache-aside reads the cache first; on a miss it reads the store, writes the value back to the cache, then returns it.",
    keyPoints: ["cache first", "write back", "return"],
    options: ["Read the cache", "On a miss, read the store", "Write the value back to the cache", "Return the value"],
    constraints: {
      before: [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    },
  },
  {
    id: cardId(105),
    topicSlug: "e2e-caching",
    primitive: "match",
    archetype: "term-meaning",
    difficulty: "Easy",
    promptMd: "Match each cache policy to what it evicts.",
    answerMd: "LRU evicts the least recently used entry; LFU the least frequently used; TTL the entry whose lifetime has expired.",
    keyPoints: ["least recently", "least frequently", "expiry"],
    left: ["LRU", "LFU", "TTL"],
    right: ["Least recently used", "Least frequently used", "Expires after a fixed lifetime"],
    pairs: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
  },
  {
    id: cardId(106),
    topicSlug: "e2e-caching",
    primitive: "bucket",
    archetype: "two-way",
    difficulty: "Easy",
    promptMd: "Sort each cache policy: evicts by time or by frequency.",
    answerMd: "LRU and FIFO evict by time; LFU evicts by frequency.",
    keyPoints: ["time", "frequency"],
    items: ["LRU", "FIFO", "LFU"],
    columns: ["Evicts by time", "Evicts by frequency"],
    pairs: [
      [0, 0],
      [1, 0],
      [2, 1],
    ],
  },
  {
    id: cardId(107),
    topicSlug: "e2e-caching",
    primitive: "assemble",
    archetype: "fill-code-blank",
    difficulty: "Medium",
    promptMd: "Assemble the line that reads a key from the cache.",
    answerMd: "cache.get(key)",
    keyPoints: ["get", "key"],
    tokens: ["cache", ".", "get", "(", "key", ")"],
    constraints: {
      before: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
      ],
    },
  },
  {
    id: cardId(108),
    topicSlug: "e2e-caching",
    primitive: "claim_grid",
    archetype: "all-that-apply",
    difficulty: "Medium",
    promptMd: "Mark each statement true or false.",
    answerMd: "A cache hit serves from the cache; a miss reads the backing store. Caches do not make writes free.",
    keyPoints: ["hit", "miss"],
    options: ["A cache hit serves from the cache", "A cache miss reads the backing store", "A cache makes writes free"],
    pairs: [
      [0, 1],
      [1, 1],
      [2, 0],
    ],
  },
  {
    id: cardId(109),
    topicSlug: "e2e-caching",
    primitive: "numeric",
    archetype: "estimate",
    difficulty: "Hard",
    promptMd: "A cache serves 10,000 requests per second and each spends 0.5 ms in the cache. How many requests are in the cache at once?",
    answerMd: "Little's law: 10,000 requests per second times 0.0005 seconds is 5 requests in flight.",
    keyPoints: ["5"],
    value: 5,
    tolerance: 0.5,
    whyStep: {
      options: [
        "Little's law: throughput times latency, 10,000 per second times 0.0005 seconds.",
        "10,000 divided by 0.5.",
        "0.5 times 10,000, but kept in milliseconds.",
        "Half of 10,000, then subtract the latency.",
      ],
      correct: 0,
    },
  },
  {
    id: cardId(110),
    topicSlug: "e2e-caching",
    primitive: "grid_toggle",
    archetype: "method-semantics",
    difficulty: "Medium",
    promptMd: "Tick the cells that hold for each HTTP method.",
    answerMd: "GET is safe, idempotent and cacheable. PUT and DELETE are idempotent but not safe or cacheable.",
    keyPoints: ["safe", "idempotent", "cacheable"],
    rows: ["GET", "PUT", "DELETE"],
    columns: ["Safe", "Idempotent", "Cacheable"],
    picked: [0, 1, 2, 4, 7],
  },
];

/** The correct index for a chosen-shape card (pick_one, tap_in_place). */
export function correctOption(card: SeedCard): number {
  return card.picked?.[0] ?? -1;
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
