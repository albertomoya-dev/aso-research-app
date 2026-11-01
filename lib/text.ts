// No "@/" imports here: lib/product-facts.ts (loaded by drizzle-kit through db/schema.ts) may import it.

/** Lower case without accents, so "Además" and "ademas" compare equal. Keeps spacing and punctuation as they are. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
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
