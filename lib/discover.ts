import { normalizeKeyword } from "./keywords";

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

/** The seed alone, then the seed followed by each letter: how people finish the phrase. */
export function discoveryPrefixes(seed: string): string[] {
  const base = normalizeKeyword(seed);
  return base ? [base, ...LETTERS.map((l) => `${base} ${l}`)] : [];
}

/** Unique suggestions in the order found, without the seed itself or keywords already followed. */
export function mergeSuggestions(lists: string[][], seed: string, existing: Iterable<string>): string[] {
  const skip = new Set([normalizeKeyword(seed), ...existing]);
  const seen = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      const term = normalizeKeyword(raw);
      if (term && !skip.has(term)) seen.add(term);
    }
  }
  return [...seen];
}
