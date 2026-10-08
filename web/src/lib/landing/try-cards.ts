// The /try page: three sample cards, written out by hand and graded in the browser. They are in
// the page bundle on purpose: no API, no corpus, nothing to scrape, and the same answer always
// gets the same mark. Every fact on them is checked in try-cards.test.ts. The cards and their
// order are the approved design's.
import { FIRST_CORRECT_DAYS, FIRST_MISS_DAYS, whenText } from "./review-days";

type TryKey = "sd" | "dsa" | "sql";

export interface TryCard {
  key: TryKey;
  /** The tab's name on a wide screen, and the short one on a phone. */
  tab: string;
  tabShort: string;
  kind: "Pick one";
  area: string;
  topic: string;
  difficulty: "Medium";
  /** The topic's colour token, for the dot and the area word. */
  topicClass: "topic-sd" | "topic-dsa" | "topic-sql";
  prompt: string;
  code: string | null;
  /** Options are code, set in the mono face. */
  monoOptions: boolean;
  options: readonly [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
  answer: string;
  keyPoint: string;
}

export const TRY_COPY = {
  heading: "Try a card.",
  lede: "No sign-in. Pick an answer and see how 90x checks it, the same way it checks every card in your day.",
  caption: "Three of the five areas. Java and CS core cards are inside.",
} as const;

export const TRY_CTA = "Continue with Google to get your Day 1";

export const TRY_CARDS: readonly TryCard[] = [
  {
    key: "sd",
    tab: "System design",
    tabShort: "Design",
    kind: "Pick one",
    area: "System design",
    topic: "Caching",
    difficulty: "Medium",
    topicClass: "topic-sd",
    prompt:
      "Product prices are cached with cache-aside and a 10-minute TTL. After an admin edits a price, some users see the old price for up to 10 minutes. What should the write path do?",
    code: null,
    monoOptions: false,
    options: [
      "Write the new price to the cache, then to the database",
      "Delete the cache key, then update the database",
      "Update the database, then delete the cache key",
      "Update only the database and let the TTL expire the old price",
    ],
    correct: 2,
    answer:
      "Update the database, then delete the key, so the next read misses and loads the new price. Deleting first leaves a gap: a read that lands between the delete and the commit loads the old price and caches it for another full TTL. Writing the cache first can leave it holding a price the database never stored if the database write fails. A rare race remains even with delete-after-commit, which is why the TTL stays as a backstop.",
    keyPoint: "Invalidate after the database commit, and keep the TTL as a backstop.",
  },
  {
    key: "dsa",
    tab: "DSA",
    tabShort: "DSA",
    kind: "Pick one",
    area: "DSA",
    topic: "Sliding window",
    difficulty: "Medium",
    topicClass: "topic-dsa",
    prompt:
      "This returns the length of the longest substring of s with no repeated character. What is its time complexity, as a tight bound, for a string of length n?",
    code: [
      "std::unordered_set<char> seen;",
      "int left = 0, best = 0;",
      "for (int right = 0; right < s.size(); ++right) {",
      "    while (seen.count(s[right])) {",
      "        seen.erase(s[left]); ++left;",
      "    }",
      "    seen.insert(s[right]);",
      "    best = std::max(best, right - left + 1);",
      "}",
      "return best;",
    ].join("\n"),
    monoOptions: false,
    options: [
      "O(n²), because the while loop sits inside the for loop",
      "O(n), because each index enters and leaves the window at most once",
      "O(n log n), because each set lookup costs log n",
      "O(n · k), where k is the size of the alphabet",
    ],
    correct: 1,
    answer:
      "O(n). Each index joins the window once, when right reaches it, and leaves at most once, when left passes it. So the while loop body runs at most n times over the whole string, not n times per step, and the hash set operations (count, insert, erase) are O(1) on average.",
    keyPoint: "Count how far each pointer moves in total. A loop inside a loop is not automatically O(n²).",
  },
  {
    key: "sql",
    tab: "SQL",
    tabShort: "SQL",
    kind: "Pick one",
    area: "SQL",
    topic: "Joins",
    difficulty: "Medium",
    topicClass: "topic-sql",
    prompt: "List every customer, with their 2026 orders if they have any. Which join keeps the customers who placed no order in 2026?",
    code: "SELECT c.name, o.id\nFROM customers c\n-- which join goes here?",
    monoOptions: true,
    options: [
      "LEFT JOIN orders o ON o.customer_id = c.id\nWHERE o.year = 2026",
      "LEFT JOIN orders o ON o.customer_id = c.id\n  AND o.year = 2026",
      "JOIN orders o ON o.customer_id = c.id\n  AND o.year = 2026",
      "RIGHT JOIN orders o ON o.customer_id = c.id\n  AND o.year = 2026",
    ],
    correct: 1,
    answer:
      "The LEFT JOIN with the year test in ON. WHERE runs after the join: a customer with no 2026 order gets NULL in o.year, NULL = 2026 is not true, so WHERE drops that row and the LEFT JOIN behaves like an inner join. A test in ON only decides which orders match; customers with no match stay, with NULLs in the order columns.",
    keyPoint: "A filter on the right-hand table of a LEFT JOIN goes in ON. In WHERE it turns the join into an inner join.",
  },
];

export interface TryVerdict {
  correct: boolean;
  /** "Correct" or "Not quite", alone: the Feed's own words (verdictText) for a pick-one card. */
  headline: string;
  /** When the card comes back, in the same plain words the phone demo uses. */
  next: string;
}

export function tryVerdict(card: TryCard, picked: number): TryVerdict {
  const correct = picked === card.correct;
  return {
    correct,
    headline: correct ? "Correct" : "Not quite",
    next: correct
      ? `In your plan, this comes back in ${FIRST_CORRECT_DAYS} days.`
      : `In your plan, this comes back ${whenText(FIRST_MISS_DAYS)}.`,
  };
}

/** The link under an answered card: the next card by name, following the tab order, and from the last one round to the first. */
export function tryNextLabel(index: number): string {
  const next = TRY_CARDS[(index + 1) % TRY_CARDS.length];
  if (!next) return "";
  return `Next card: ${next.tab}`;
}
