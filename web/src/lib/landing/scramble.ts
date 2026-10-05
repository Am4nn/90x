// The hero's changing line. Each phrase types itself in from noise: letters that have
// not landed yet show random symbols, and one letter lands every 22 ms. Pure, so the
// timeline is tested without a browser.

export const HEADLINE_LEAD = "A coach that";
export const PHRASES = ["grades what you type.", "plans your next day.", "remembers what you miss."] as const;
/** The spoken version of the whole headline: the animated line is hidden from screen readers. */
export const HEADLINE_SENTENCE = "A coach that grades what you type, plans your next day and remembers what you miss.";

const GLYPHS = "#%@*+=-:/<>";
/** How long each phrase stays, in milliseconds. */
export const PHRASE_MS = 3400;
/** How often a letter lands. */
const LAND_MS = 22;
/** How often the noise changes. */
const NOISE_MS = 60;

/** The not-yet-landed tail of `text` as symbols (spaces stay spaces), given how many letters have landed. */
export function scramble(text: string, landed: number, seed: number): string {
  let out = "";
  for (let i = landed; i < text.length; i++) out += text[i] === " " ? " " : GLYPHS[(i * 7 + seed) % GLYPHS.length];
  return out;
}

export interface HeadlineFrame {
  /** Index into PHRASES. */
  phrase: number;
  /** The letters that have landed. */
  landed: string;
  /** The noise after them. */
  noise: string;
}

/** The headline's second line `elapsed` milliseconds in. */
export function headlineFrame(elapsed: number): HeadlineFrame {
  const phrase = Math.floor(elapsed / PHRASE_MS) % PHRASES.length;
  const into = elapsed % PHRASE_MS;
  const text = PHRASES[phrase]!;
  const landed = Math.min(text.length, Math.floor(into / LAND_MS));
  return { phrase, landed: text.slice(0, landed), noise: scramble(text, landed, Math.floor(into / NOISE_MS)) };
}

/** The line as it reads when nothing moves: the first phrase, complete. */
export const STILL_HEADLINE: HeadlineFrame = { phrase: 0, landed: PHRASES[0], noise: "" };
