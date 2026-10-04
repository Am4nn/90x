// Small helpers for the code a question shows.

/** The language named by the first fenced block in a question (```python), or null. */
export function codeLanguage(promptMd: string): string | null {
  const match = /```([A-Za-z][\w+#-]*)/.exec(promptMd);
  return match?.[1]?.toLowerCase() ?? null;
}
