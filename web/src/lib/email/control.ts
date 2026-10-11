/**
 * True when the text holds a control character (a line break, NUL, DEL, a C1 control, the Unicode line and
 * paragraph separators), which has no place in a header or an address.
 */
export function hasControl(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}
