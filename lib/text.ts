// No "@/" imports here: lib/product-facts.ts (loaded by drizzle-kit through db/schema.ts) may import it.

/** Lower case without accents, so "Además" and "ademas" compare equal. Keeps spacing and punctuation as they are. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}
