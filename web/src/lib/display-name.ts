// A display name someone chose, reduced to a short plain label before it goes anywhere another
// person reads it as if it came from 90x: another user's Coach prompt, an email subject.
//
// Letters (any script, with their accents), digits, spaces and . ' - only. That is enough for any
// real name and too little for a sentence of instructions, a URL (no / or :), Markdown (no [ ] ( ) !)
// or a fake sender line ("Your bank: verify at ...").

const NAME_CHARS = /[^\p{L}\p{M}\p{N} '.-]/gu;
const CONTROL = /\p{Cc}/gu;
const INVISIBLE = /\p{Cf}/gu;

/** The name as a short plain label (line breaks become spaces, zero-width and bidi marks go), or "" when nothing printable is left. */
export function plainName(name: string, max: number): string {
  return name.replace(INVISIBLE, "").replace(CONTROL, " ").replace(NAME_CHARS, "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}
