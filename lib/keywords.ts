export const MAX_KEYWORD_LENGTH = 100;
export const MAX_KEYWORDS_PER_BATCH = 200;

export function normalizeKeyword(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** Splits text pasted by the user (one per line or comma separated) into unique keywords. */
export function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\n,;]+/)) {
    const term = normalizeKeyword(part);
    if (term && term.length <= MAX_KEYWORD_LENGTH) seen.add(term);
  }
  return [...seen].slice(0, MAX_KEYWORDS_PER_BATCH);
}
