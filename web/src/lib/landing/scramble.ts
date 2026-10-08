// The hero's changing line. Each phrase stays for six seconds; as it arrives, only the
// words that differ from the phrase before it type themselves in from noise: letters that have not
// landed yet show random symbols, and one letter lands every 22 ms. Words the two phrases
// share stay put. Pure, so the timeline is tested without a browser.

export const HEADLINE_LEAD = "Backend interview prep";
export const PHRASES = ["that plans your day.", "that checks every answer.", "that remembers what you miss."] as const;
/** The spoken version of the whole headline: the animated line is hidden from screen readers. */
export const HEADLINE_SENTENCE = "Backend interview prep that plans your day, checks every answer and remembers what you miss.";

const GLYPHS = "#%@*+=-:/<>";
/** How long each phrase stays, in milliseconds. */
export const PHRASE_MS = 6000;
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

/** A run of the line: real letters, or noise still to land (drawn muted). */
interface HeadlinePart {
  text: string;
  noise: boolean;
}

export interface HeadlineFrame {
  /** Index into PHRASES. */
  phrase: number;
  /** The line, left to right, in runs of landed letters and noise. */
  parts: HeadlinePart[];
}

/** Which characters of `text` belong to a word that is not at the same place in `before`. Spaces never change. */
export function changedLetters(text: string, before: string): boolean[] {
  const old = before.split(" ");
  return text
    .split(" ")
    .flatMap((word, i) => [...[...word].map(() => word !== old[i]), false])
    .slice(0, text.length);
}

/** The headline's second line `elapsed` milliseconds in. The first phrase is already whole on the first pass:
 *  there is nothing before it to change from. */
export function headlineFrame(elapsed: number): HeadlineFrame {
  const phrase = Math.floor(elapsed / PHRASE_MS) % PHRASES.length;
  const into = elapsed % PHRASE_MS;
  const text = PHRASES[phrase]!;
  const before = elapsed < PHRASE_MS ? text : PHRASES[(phrase + PHRASES.length - 1) % PHRASES.length]!;
  const changed = changedLetters(text, before);
  const landed = Math.floor(into / LAND_MS);
  const seed = Math.floor(into / NOISE_MS);
  const parts: HeadlinePart[] = [];
  let k = 0;
  for (let i = 0; i < text.length; i++) {
    const noise = changed[i]! && k++ >= landed;
    const char = noise ? GLYPHS[(i * 7 + seed) % GLYPHS.length]! : text[i]!;
    const last = parts.at(-1);
    if (last && last.noise === noise) last.text += char;
    else parts.push({ text: char, noise });
  }
  return { phrase, parts };
}

/** The line as it reads when nothing moves: the first phrase, complete. */
export const STILL_HEADLINE: HeadlineFrame = { phrase: 0, parts: [{ text: PHRASES[0], noise: false }] };
