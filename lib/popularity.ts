import { normalizeKeyword } from "./keywords";
import type { AppSummary } from "./stores/types";
import { fold } from "./text";

/** Longest prefix tried before giving up on finding the keyword in the autocomplete. */
export const MAX_PREFIX = 12;

/**
 * 0–100 from where the keyword shows up in the store autocomplete. A keyword the
 * store suggests after one or two letters is searched a lot; one that needs the
 * whole phrase typed is searched little. The position in the list adds a little.
 */
export function autocompleteScore(prefixLength: number, index: number, termLength: number): number {
  const length = Math.min(termLength, MAX_PREFIX);
  const prefixFactor = 1 - (Math.min(prefixLength, length) - 1) / length;
  const rankFactor = 1 - Math.min(index, 10) * 0.05;
  return Math.max(1, Math.round(100 * prefixFactor * rankFactor));
}

export type AutocompleteResult = {
  popularity: number;
  /** Characters typed before the store suggested the keyword; null when it never did. */
  prefixLength: number | null;
  requests: number;
};

/** Types the keyword one letter at a time until the store suggests it. */
export async function measureAutocomplete(term: string, suggest: (prefix: string) => Promise<string[]>): Promise<AutocompleteResult> {
  const target = normalizeKeyword(term);
  const limit = Math.min(target.length, MAX_PREFIX);
  let requests = 0;
  for (let k = 1; k <= limit; k++) {
    const prefix = target.slice(0, k);
    if (prefix.endsWith(" ")) continue;
    const suggestions = (await suggest(prefix)).map(normalizeKeyword);
    requests++;
    const index = suggestions.indexOf(target);
    if (index !== -1) return { popularity: autocompleteScore(k, index, target.length), prefixLength: k, requests };
  }
  // Not suggested even with the first 12 letters: rarely searched.
  return { popularity: 0, prefixLength: null, requests };
}

/**
 * 0–100 from the strength of the top 10: how many target the keyword in their title,
 * their rating and, where the store gives it, how many ratings they have.
 */
export function difficultyScore(top: AppSummary[], term: string): number {
  const apps = top.slice(0, 10);
  if (apps.length === 0) return 0;
  const words = fold(term).split(" ").filter(Boolean);
  const titleMatch = apps.filter((a) => words.every((w) => fold(a.title).includes(w))).length / apps.length;
  const rating = apps.reduce((sum, a) => sum + (a.rating ?? 0), 0) / apps.length / 5;
  const counts = apps.map((a) => a.ratingsCount).filter((c): c is number => c != null);
  if (counts.length === 0) return Math.round(100 * (0.5 * titleMatch + 0.5 * rating));
  // log10: 1M ratings → 1.0, 1k → 0.5.
  const volume = Math.min(1, counts.reduce((sum, c) => sum + Math.log10(c + 1), 0) / counts.length / 6);
  return Math.round(100 * (0.4 * titleMatch + 0.25 * rating + 0.35 * volume));
}

/** Popular, winnable keywords score high. Relevance (0–1) comes from the AI step when there is one. */
export function opportunityScore(popularity: number, difficulty: number, relevance = 1): number {
  return Math.round(popularity * (1 - 0.7 * (difficulty / 100)) * relevance);
}
