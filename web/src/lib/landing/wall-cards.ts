// The Feed wall: sample cards, written out by hand. They are static on purpose, with no
// database behind them, so every fact on them has to be right and checkable (see
// wall-cards.test.ts, which checks the ones that can be computed). Each card is one of
// the Feed's kinds of card, named by its primitive (lib/feed/archetypes.ts).
import type { Primitive } from "@/lib/feed/archetypes";

export type WallTopic = "sql" | "dsa" | "cs" | "beh" | "sd";
/** How a row reads: right (green), wrong (red) or plain. */
export type WallTone = "ok" | "bad" | "plain";

export interface WallRow {
  /** The letter, number, mark or code in front of the row. "tick" and "cross" draw a mark. */
  label: string;
  text: string;
  tone: WallTone;
  /** Code, set in the mono face. */
  code?: boolean;
  /** A grid row: the text is split into columns. */
  cells?: readonly string[];
}

export interface WallCard {
  topic: WallTopic;
  topicName: string;
  /** What the card is called on the wall. */
  kind: string;
  primitive: Primitive;
  prompt: string;
  /** A large number the card answers with. */
  big?: string;
  rows: readonly WallRow[];
  verdict: string;
  verdictTone: "ok" | "bad";
}

const row = (label: string, text: string, tone: WallTone = "plain", code = false): WallRow => ({ label, text, tone, code });

export const WALL_CARDS: readonly WallCard[] = [
  {
    topic: "sql",
    topicName: "SQL",
    kind: "Pick one",
    primitive: "pick_one",
    prompt: "Which ACID property means all of a transaction's writes apply, or none do?",
    rows: [row("A", "Durability"), row("B", "Atomicity", "ok"), row("C", "Isolation"), row("D", "Consistency")],
    verdict: "Correct",
    verdictTone: "ok",
  },
  {
    topic: "dsa",
    topicName: "DSA",
    kind: "Tap the line",
    primitive: "tap_in_place",
    prompt: "Tap the line that breaks find_max for some inputs.",
    // Line 2 is the bug (it returns 0 for a list of negative numbers); the reader tapped line 4.
    rows: [
      row("1", "def find_max(nums):", "plain", true),
      row("2", "    best = 0", "ok", true),
      row("3", "    for n in nums:", "plain", true),
      row("4", "        if n > best:", "bad", true),
      row("5", "            best = n", "plain", true),
      row("6", "    return best", "plain", true),
    ],
    verdict: "Not quite · back tomorrow",
    verdictTone: "bad",
  },
  {
    topic: "cs",
    topicName: "CS core",
    kind: "Number",
    primitive: "numeric",
    prompt: "How many bits give 200 values their own pattern?",
    big: "8",
    rows: [],
    verdict: "Correct",
    verdictTone: "ok",
  },
  {
    topic: "beh",
    topicName: "Behavioural",
    kind: "Write it out",
    primitive: "compose",
    prompt: "Tell me about a time you received difficult feedback.",
    rows: [
      row("tick", "Names a specific piece of feedback", "ok"),
      row("tick", "States what you changed", "ok"),
      row("cross", "Says what happened afterwards", "bad"),
    ],
    verdict: "Not quite · 1 point missed",
    verdictTone: "bad",
  },
  {
    topic: "cs",
    topicName: "CS core",
    kind: "Order",
    primitive: "order",
    prompt: "Put the steps of a TCP connection in order.",
    // The reader put the close before the data.
    rows: [
      row("1", "SYN", "ok"),
      row("2", "SYN-ACK", "ok"),
      row("3", "ACK", "ok"),
      row("4", "FIN", "bad"),
      row("5", "Data transfer", "bad"),
    ],
    verdict: "Not quite · back tomorrow",
    verdictTone: "bad",
  },
  {
    topic: "cs",
    topicName: "CS core",
    kind: "Match",
    primitive: "match",
    prompt: "Pair each HTTP status code with its meaning.",
    rows: [
      row("301", "Moved permanently", "ok", true),
      row("401", "Not authenticated", "ok", true),
      row("404", "Not found", "ok", true),
      row("503", "Service unavailable", "ok", true),
    ],
    verdict: "Correct",
    verdictTone: "ok",
  },
  {
    topic: "dsa",
    topicName: "DSA",
    kind: "Tick the grid",
    primitive: "grid_toggle",
    prompt: "Tick the order each structure removes items in.",
    rows: [
      { label: "", text: "", tone: "ok", code: true, cells: ["Stack", "LIFO ✓", "FIFO"] },
      { label: "", text: "", tone: "ok", code: true, cells: ["Queue", "LIFO", "FIFO ✓"] },
    ],
    verdict: "Correct",
    verdictTone: "ok",
  },
  {
    topic: "sd",
    topicName: "System design",
    kind: "True or false",
    primitive: "claim_grid",
    prompt: "N = 3. Mark each statement.",
    rows: [
      row("T", "W=2, R=2 always reads the latest acknowledged write", "ok"),
      row("T", "W=1, R=1 can return a stale value", "ok"),
      row("F", "Quorums alone order concurrent writes", "bad"),
    ],
    verdict: "Not quite",
    verdictTone: "bad",
  },
  {
    topic: "cs",
    topicName: "CS core",
    kind: "Sort",
    primitive: "bucket",
    prompt: "Sort each use by the transport it runs over.",
    rows: [row("UDP", "DNS query · Live video call", "ok", true), row("TCP", "HTTP/1.1 · SSH session", "ok", true)],
    verdict: "Correct",
    verdictTone: "ok",
  },
];

/** How many kinds of card the Feed has, in words, for the line under the wall's heading. */
export const KIND_COUNT_WORD = "Ten";
