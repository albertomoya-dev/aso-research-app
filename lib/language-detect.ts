import { languageStopwords, STOPWORD_LANGS } from "./stopwords";
import { fold } from "./text";

// Pure language guess for store texts, from function words (lib/stopwords.ts). Good enough to tell a
// Spanish description from an English one; not meant for a two-word title.

/** Fewer words than this (after removing the brand) is too little text to tell the language. */
export const MIN_WORDS = 4;
/** The winner needs at least this score (a word shared by two languages counts half for each). */
const MIN_SCORE = 1.5;
/** …and this lead over the runner-up, as a share of its own score. */
const MIN_MARGIN = 0.25;

const tokens = (text: string) => fold(text).split(/[^\p{L}\p{N}'’]+/u).filter(Boolean);

let index: Map<string, string[]> | null = null;
/** Word → languages whose function words include it. */
function languagesByWord(): Map<string, string[]> {
  if (index) return index;
  index = new Map();
  for (const lang of STOPWORD_LANGS) {
    for (const w of languageStopwords(lang)) index.set(w, [...(index.get(w) ?? []), lang]);
  }
  return index;
}

export type LanguageGuess = { lang: string | null; scores: Record<string, number>; words: number };

/**
 * Most likely language of `text` among the stopword languages (es, en, pt, fr, de, it), or null when the
 * text is too short or no language stands out. Each function word adds 1/(languages that share it), so
 * «de» or «a» weigh little and «the», «para», «avec» decide. `ignore`: words that say nothing about the
 * language (the brand).
 */
export function detectLanguage(text: string, ignore: string[] = []): LanguageGuess {
  const skip = new Set(ignore.flatMap(tokens));
  const ws = tokens(text).filter((w) => !skip.has(w) && !/^\d+$/.test(w));
  const scores: Record<string, number> = {};
  const byWord = languagesByWord();
  for (const w of ws) {
    const langs = byWord.get(w);
    if (!langs) continue;
    for (const l of langs) scores[l] = (scores[l] ?? 0) + 1 / langs.length;
  }
  if (ws.length < MIN_WORDS) return { lang: null, scores, words: ws.length };
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] < MIN_SCORE) return { lang: null, scores, words: ws.length };
  if (second && best[1] - second[1] < best[1] * MIN_MARGIN) return { lang: null, scores, words: ws.length };
  return { lang: best[0], scores, words: ws.length };
}

/** Another language must reach this score for a field to count as written in it. */
const MIN_OTHER_SCORE = 1;

/**
 * Whether `text` is NOT in the `target` language: null when it is (or the text is too short to tell),
 * else `{ found }` with the language it seems to be in (null when two tie and neither is `prefer`).
 * Asks less than `detectLanguage`: a short Spanish line («alarmas de medicamentos y control de tu
 * tratamiento») may not say if it is Spanish or Portuguese, but it clearly is not English, which always
 * brings its own function words. For a target without a stopword list (ja, ko…), any detected language is wrong.
 */
export function wrongLanguage(text: string, target: string, opts: { ignore?: string[]; prefer?: string } = {}): { found: string | null } | null {
  const guess = detectLanguage(text, opts.ignore);
  if (guess.words < MIN_WORDS) return null;
  if (!STOPWORD_LANGS.includes(target)) return guess.lang ? { found: guess.lang } : null;
  const own = guess.scores[target] ?? 0;
  const others = Object.entries(guess.scores)
    .filter(([l]) => l !== target)
    .sort((a, b) => b[1] - a[1]);
  const top = others[0];
  if (!top || top[1] < MIN_OTHER_SCORE || own >= top[1] / 2) return null;
  const tied = others.filter(([, s]) => top[1] - s < 1e-9).map(([l]) => l);
  return { found: opts.prefer && tied.includes(opts.prefer) ? opts.prefer : tied.length === 1 ? tied[0] : null };
}
