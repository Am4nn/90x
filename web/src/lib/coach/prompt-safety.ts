// Text that crosses into a model prompt must be treated as data, not
// instructions. The one user-controlled string that reaches another user's
// model is a friend's display name (via get_friend_summary). A name carrying
// a newline or a bidi override could smuggle a line of "instructions" into
// that prompt, or reorder what the model reads. Strip it here, at the boundary.

// C0 and C1 control characters (including \n, \r, \t) become spaces, so a name
// cannot smuggle a line break into a prompt. Zero-width and bidi marks are
// removed entirely, so they cannot split or visually reorder what is read.
const CONTROL = /\p{Cc}/gu;
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\ufeff]/g;

export function sanitizeForPrompt(text: string): string {
  return text.replace(INVISIBLE, "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}
