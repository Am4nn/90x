// The code in a share link and a card URL. Pure, so the tests can feed it bytes.

export const CODE_LENGTH = 8;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
// 256 is not a multiple of 36, so bytes at or above this would make the first
// characters likelier than the last. They are skipped, not wrapped.
const UNBIASED_BELOW = 252;

const fromCrypto = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function generateShareCode(random: (n: number) => Uint8Array = fromCrypto): string {
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const byte of random(16)) {
      if (byte < UNBIASED_BELOW) out += ALPHABET[byte % ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

/** True for a well-formed code. Checked before any database lookup, so junk in a URL costs nothing. */
export function isShareCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{8}$/.test(value);
}
