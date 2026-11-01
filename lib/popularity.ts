import { normalizeKeyword } from "./keywords";
import type { AppSummary } from "./stores/types";
import { fold } from "./text";

/** Letters always typed one by one, whatever the keyword. */
export const MAX_PREFIX = 12;

/**
 * Most autocomplete requests per keyword. Popularity is measured weekly for every keyword
 * and Google Play answers with 429 when pushed, so long keywords skip letters (see
 * `autocompletePrefixes`) instead of typing them all.
 */
export const MAX_AUTOCOMPLETE_REQUESTS = 16;

/** Highest prefix factor once the letters typed go past the scale length (score 5 at most). */
const TAIL_FACTOR = 0.05;

/**
 * Letters the score is measured against: L' = min(L, max(MAX_PREFIX, first word + 4)), with L the
 * keyword length. Up to 12 letters it is the keyword itself (the scale before long keywords were
 * measured); a long keyword only stretches it to its first word plus a few letters of the next one,
 * so typing 27 letters of a 45-letter keyword is not worth more than typing 8 of a 10-letter one.
 */
export function scoreLength(term: string): number {
  const firstWord = term.trim().split(/\s+/)[0]?.length ?? 0;
  return Math.max(1, Math.min(term.length, Math.max(MAX_PREFIX, firstWord + 4)));
}

/**
 * 0–100 from where the keyword shows up in the store autocomplete. A keyword the
 * store suggests after one or two letters is searched a lot; one that needs the
 * whole phrase typed is searched little. The position in the list adds a little.
 *
 * score = 100 × f(p) × (1 − 0.05 × min(index, 10)), at least 1, where p = letters typed,
 * L = keyword length, L' = scoreLength (see above) and
 *   f(p) = 1 − (p − 1) / L'                                   while p ≤ L'
 *   f(p) = min(1 / L', 0.05) × (1 − (p − L') / (L − L' + 1))   after (a small tail: score 1–5)
 * so the score never rises with more letters typed, a keyword the store suggests always
 * scores at least 1 and short keywords keep the scale they always had. «recordatorio p» of
 * «recordatorio pastillas» (L' = 16) scores 19; the whole keyword typed scores 1.
 */
export function autocompleteScore(prefixLength: number, index: number, term: string): number {
  const length = Math.max(1, term.length);
  const scale = scoreLength(term);
  const p = Math.max(1, Math.min(prefixLength, length));
  const prefixFactor =
    p <= scale ? 1 - (p - 1) / scale : Math.min(1 / scale, TAIL_FACTOR) * (1 - (p - scale) / (length - scale + 1));
  const rankFactor = 1 - Math.min(index, 10) * 0.05;
  return Math.max(1, Math.round(100 * prefixFactor * rankFactor));
}

/**
 * Lengths of the prefixes to try, shortest first, never ending in a space. The first
 * MAX_PREFIX letters go one by one; after that only the first two letters of each next
 * word (what distinguishes «recordatorio pastillas» from «recordatorio medicamentos»)
 * and, always, the whole keyword. Capped at MAX_AUTOCOMPLETE_REQUESTS, keeping the
 * whole keyword as the last try so «never suggested» is a real measurement.
 */
export function autocompletePrefixes(target: string): number[] {
  const lengths = new Set<number>();
  const add = (k: number) => {
    if (k >= 1 && k <= target.length && target[k - 1] !== " ") lengths.add(k);
  };
  for (let k = 1; k <= Math.min(target.length, MAX_PREFIX); k++) add(k);
  for (let i = MAX_PREFIX; i < target.length; i++) {
    if (target[i - 1] === " " && target[i] !== " ") {
      add(i + 1);
      add(i + 2);
    }
  }
  const sorted = [...lengths].sort((a, b) => a - b).filter((k) => k < target.length);
  return [...sorted.slice(0, MAX_AUTOCOMPLETE_REQUESTS - 1), target.length];
}

export type AutocompleteResult = {
  /** 0 means the store did not suggest it even with the whole keyword typed: rarely searched. */
  popularity: number;
  /** Characters typed before the store suggested the keyword; null when it never did. */
  prefixLength: number | null;
  requests: number;
};

/** Types the keyword (see `autocompletePrefixes`) until the store suggests it. */
export async function measureAutocomplete(term: string, suggest: (prefix: string) => Promise<string[]>): Promise<AutocompleteResult> {
  const target = normalizeKeyword(term);
  let requests = 0;
  if (!target) return { popularity: 0, prefixLength: null, requests };
  for (const k of autocompletePrefixes(target)) {
    const suggestions = (await suggest(target.slice(0, k))).map(normalizeKeyword);
    requests++;
    const index = suggestions.indexOf(target);
    if (index !== -1) return { popularity: autocompleteScore(k, index, target), prefixLength: k, requests };
  }
  // Not suggested even with the whole keyword typed: rarely searched.
  return { popularity: 0, prefixLength: null, requests };
}

/** Tooltip for the popularity cell: what «–» and 0 mean. */
export function popularityHint(popularity: number | null): string | undefined {
  if (popularity == null) return "Sin medir todavía: se mide cada semana con el autocompletado de la tienda.";
  if (popularity === 0) return "La tienda no la sugiere ni escribiéndola entera: se busca poco.";
  return undefined;
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
