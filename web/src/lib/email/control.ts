/** True when the text holds a control character (a line break, NUL, DEL, ...), which has no place in a header or an address. */
export function hasControl(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
