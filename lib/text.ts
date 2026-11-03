// No "@/" imports here: lib/product-facts.ts (loaded by drizzle-kit through db/schema.ts) may import it.

/** Lower case without accents, so "Además" and "ademas" compare equal. Keeps spacing and punctuation as they are. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

/**
 * `fold(text)` with, for each of its positions (and one past the end), the position in `text` it comes
 * from. fold() changes the length of decomposed letters («e» + combining accent) and of some lower-case
 * forms, so positions in the folded text are only valid there; this maps them back to the original.
 * A combining mark folds to nothing, so a range ending at `at[end]` keeps the accents of its last letter.
 */
export function foldWithMap(text: string): { folded: string; at: number[] } {
  let folded = "";
  const at: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = fold(ch);
    folded += f;
    for (let k = 0; k < f.length; k++) at.push(i);
    i += ch.length;
  }
  at.push(text.length);
  return { folded, at };
}

/** A stretch of a text, [start, end) in UTF-16 positions of the ORIGINAL text (what a textarea uses). */
export type Range = [number, number];

/** Words of a text (folded, split on anything that is not a letter or a digit) with their [start, end) in the original. */
export function wordSpans(text: string): { word: string; start: number; end: number }[] {
  const { folded, at } = foldWithMap(text);
  return [...folded.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ word: m[0], start: at[m.index], end: at[m.index + m[0].length] }));
}

/**
 * Where the phrase appears in the text, matched like `containsPhrase` in lib/metadata-check.ts (folded,
 * word by word, ignoring punctuation): one range per occurrence, from the start of its first word to the
 * end of its last, in the original text, so «Recordatório» or a decomposed accent is covered whole.
 * Pass `spans` (`wordSpans(text)`) to look up many phrases in the same text without splitting it again.
 */
export function phraseRanges(text: string, phrase: string, spans?: ReturnType<typeof wordSpans>): Range[] {
  const needle = wordSpans(phrase).map((w) => w.word);
  if (needle.length === 0) return [];
  const hay = spans ?? wordSpans(text);
  const out: Range[] = [];
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((w, j) => hay[i + j].word === w)) out.push([hay[i].start, hay[i + needle.length - 1].end]);
  }
  return out;
}

/** Letters kept by `stem`: enough to tell words apart, few enough to join plurals, accents and close forms across languages. */
export const STEM_LENGTH = 5;

/**
 * Rough stem of a folded word: without a final "s", cut to its first STEM_LENGTH letters, so "pills" and
 * "pill", "antibiotic" and "antibiotico", or "registros" and "registro" share it.
 */
export function stem(word: string): string {
  const chars = [...word];
  const base = chars.length > 3 && chars[chars.length - 1] === "s" ? chars.slice(0, -1) : chars;
  return base.slice(0, STEM_LENGTH).join("");
}

/**
 * Same root: same stem and similar length, so "antibiotic" matches "antibiotico" but a compound brand
 * ("smartpatient") does not match the short word it starts with ("smart").
 */
export function sameRoot(a: string, b: string): boolean {
  if (stem(a) !== stem(b)) return false;
  const [x, y] = [[...a].length, [...b].length];
  return Math.min(x, y) / Math.max(x, y) >= 0.6;
}
