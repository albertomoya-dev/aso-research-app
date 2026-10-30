// No "@/" imports here: db/schema.ts imports this file and drizzle-kit loads it without the alias.

/** Where a followed keyword came from. "autocomplete" is the old value for Descubrir, kept for existing rows. */
export const KEYWORD_SOURCES = ["manual", "ai", "autocomplete", "top10", "discover"] as const;
export type KeywordSource = (typeof KEYWORD_SOURCES)[number];

export const SOURCE_LABEL: Record<KeywordSource, string> = {
  manual: "Manual",
  ai: "Sugerida por IA",
  autocomplete: "Autocompletado",
  top10: "TOP 10 de la competencia",
  discover: "Descubrir",
};

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
