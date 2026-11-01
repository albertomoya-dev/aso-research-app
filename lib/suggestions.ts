import { z } from "zod";
import { normalizeKeyword } from "./keywords";
import type { AppMeta, Store } from "./stores/types";
import { genericWordsFor, stopwordsFor, titleCommonWords } from "./stopwords";
import { fold, sameRoot, stem } from "./text";

/** Bump when the instructions or the output shape change, so old suggestions can be told apart. */
export const PROMPT_VERSION = "kw-3";
export const MAX_SUGGESTIONS = 40;

export const INTENTS = ["category", "feature", "problem", "audience", "competitor-alternative", "long-tail"] as const;
export const COMPETITION = ["low", "medium", "high"] as const;

export const INTENT_LABEL: Record<(typeof INTENTS)[number], string> = {
  category: "Categoría",
  feature: "Función",
  problem: "Problema",
  audience: "Público",
  "competitor-alternative": "Alternativa",
  "long-tail": "Long tail",
};
export const COMPETITION_LABEL: Record<(typeof COMPETITION)[number], string> = { low: "Baja", medium: "Media", high: "Alta" };

/**
 * Shape requested from the model. Kept loose (plain strings and numbers) so the
 * structured-output schema stays simple; `suggestionSchema` checks each item after.
 */
export const modelOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      keyword: z.string(),
      language: z.string(),
      intent: z.string(),
      relevance: z.number(),
      estimatedCompetition: z.string(),
      reason: z.string(),
    }),
  ),
});
export type ModelOutput = z.infer<typeof modelOutputSchema>;

export const suggestionSchema = z.object({
  keyword: z.string().transform(normalizeKeyword).pipe(z.string().min(2).max(60)),
  language: z.string().trim().toLowerCase().min(2).max(10),
  intent: z.enum(INTENTS).catch("long-tail"),
  relevance: z.number().int().min(1).max(5),
  estimatedCompetition: z.enum(COMPETITION).catch("medium"),
  reason: z.string().trim().min(1).max(300),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export const SYSTEM_PROMPT = `You are an App Store Optimization (ASO) specialist. You propose search keywords that real users type into the App Store or Google Play to find an app like the one described.

Rules:
- Write every keyword in the store's language, the way people type it in that country: lower case, no punctuation, no hashtags, one to four words.
- Only propose keywords that describe what the app actually does or the problem it solves. Relevance means how well the app answers that search, from 1 (barely related) to 5 (exactly what the app is).
- When the prompt includes PRODUCT FACTS, they are the source of truth about what the app does: use the features listed there (the listing is only a reference and may be outdated), never propose keywords for features it does not list, and follow its constraints. Without PRODUCT FACTS, rely on the listing and do not invent features.
- Never propose brand names of other apps or companies, even when they are listed as competitors. You may propose generic alternatives ("strava alternative" is not allowed, "running tracker" is).
- Do not repeat keywords the user already tracks or has rejected, and do not return two keywords that only differ in plural, accents or word order.
- Mix short category terms with specific long-tail phrases. Long-tail phrases are usually easier to rank for.
- estimatedCompetition is your guess of how crowded the results are (low, medium, high). You do not know real search volumes, so do not invent numbers.
- intent is one of: category (what kind of app), feature (a capability), problem (what the user wants to solve), audience (who it is for), competitor-alternative (generic term people use when switching apps), long-tail (specific phrase).
- reason is one short sentence in Spanish explaining why the keyword fits this app.
- The autocomplete phrases come from the store itself and show what people really search. Prefer them, or close variants, when they are relevant.
- Return between 20 and ${MAX_SUGGESTIONS} keywords, best first.`;

export type PromptInput = {
  store: Store;
  countryName: string;
  lang: string;
  meta: Pick<AppMeta, "title" | "developer" | "category" | "shortDescription" | "description"> &
    Partial<Pick<AppMeta, "version" | "releaseNotes">>;
  /** PRODUCT FACTS block from `factsForPrompt`, or null when the owner has not filled in the product sheet. */
  facts: string | null;
  existing: string[];
  rejected: string[];
  autocomplete: string[];
  competitors: { title: string; developer: string }[];
  focus?: string;
};

const clip = (s: string | null | undefined, max: number) => (s ? (s.length > max ? `${s.slice(0, max)}…` : s) : "–");
const list = (items: string[]) => (items.length ? items.join(", ") : "(none)");

export function buildUserPrompt(input: PromptInput): string {
  const { meta } = input;
  return [
    `Store: ${input.store === "ios" ? "Apple App Store" : "Google Play"}, country: ${input.countryName}, language code: ${input.lang}.`,
    "",
    input.facts ? "App listing (may be outdated; PRODUCT FACTS below win):" : "App listing:",
    `Title: ${meta.title}`,
    `Developer: ${meta.developer}`,
    `Category: ${meta.category ?? "–"}`,
    input.store === "android" ? `Short description: ${clip(meta.shortDescription, 200)}` : null,
    `Description: ${clip(meta.description, 3000)}`,
    meta.version ? `Published version: ${meta.version}${meta.releaseNotes ? `. Release notes: ${clip(meta.releaseNotes, 500)}` : ""}` : null,
    input.facts ? "" : null,
    input.facts,
    "",
    `Keywords already tracked: ${list(input.existing)}`,
    `Keywords the user rejected before: ${list(input.rejected)}`,
    `Store autocomplete phrases for words in the title and category: ${list(input.autocomplete)}`,
    `Apps ranking for the tracked keywords (do not use their brands): ${list(input.competitors.map((c) => `${c.title} (${c.developer})`))}`,
    input.focus ? `\nThe user wants ideas focused on: ${input.focus}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** Folded and normalized: "Zapatillas  Running" → "zapatillas running". */
const foldKey = (s: string) => normalizeKeyword(fold(s));
const LEGAL_SUFFIX = /[,.]?\s+(inc|llc|ltd|limited|gmbh|s\.?l\.?u?|s\.?a\.?|corp(oration)?|co|pty|ab|oy|bv|ag|sas|srl|plc)\.?$/i;
// Splits "Strava: Run & Ride" or "Nike Run Club - Running" into brand and tagline.
const TITLE_SEPARATOR = /\s*(?::|\s[-–—|·]\s)\s*/;

export type BrandOptions = {
  /** Our own title: its words are never a competitor brand. */
  ownTitle?: string;
  /** Keywords the user tracks: a tracked word or phrase is never a brand. */
  trackedTerms?: string[];
  /** Our own words from the product sheet (`productBrandTerms`: pitch, audience, features): never a brand. */
  productTerms?: string;
  /** Words the user marked as «no es una marca». */
  exceptions?: string[];
  /** Store language, for the stopwords and generic words. */
  lang?: string;
};

/** A title head used by this many distinct apps or more is a common phrase, not a brand. */
export const COMMON_TITLE_APPS = 3;
/** Letters a lowercase first word needs to pass for a made-up name when nothing else says it is a brand. */
const MIN_MADE_UP = 6;
/** Words that make up generic developer names ("Fit Apps" is a brand, "Apps Studio" is not). */
const DEVELOPER_FILLER = new Set(
  "apps app games game studio studios lab labs dev developer developers development mobile software soft tech technologies technology solutions digital media group team interactive online inc llc ltd corp".split(
    " ",
  ),
);

const words = (s: string) => foldKey(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Brands of other apps, in two groups: from app titles (shown as «Marcas detectadas») and developer names. */
export type BrandGroups = { brands: string[]; developers: string[] };

/** A folded word without its plural ending: «pills» → «pill», «diaries» → «diary», «classes» → «class», but «class» stays. */
function singular(w: string): string {
  if ([...w].length <= 3) return w;
  if (/[^aeiou]ies$/.test(w)) return `${w.slice(0, -3)}y`;
  if (/(?:ss|sh|ch|x|z)es$/.test(w)) return w.slice(0, -2);
  // A final «s» after another «s» is part of the word («class», «process»).
  if (/[^s]s$/.test(w)) return w.slice(0, -1);
  return w;
}

/**
 * A folded word without its plural ending and final vowel: «pills» → «pill», «diaries» → «diary»,
 * «classes» → «class», «antibiótico» → «antibiotic», «medicine» → «medicin». Exported for tests.
 */
export function wordBase(w: string): string {
  return singular(w).replace(/(?<=\p{L}{3})[aeiou]$/u, "");
}

/**
 * The same word up to an inflection (`sameRoot` of the singulars and the same base): «pill» and «pills»,
 * «diary» and «diaries», «antibiotic» and «antibiótico», «alarm» and «alarma». Stricter than `sameRoot`,
 * which also joins a made-up name with the word it plays on («Remindy» and «reminder»). Exported for tests.
 */
export function sameWord(a: string, b: string): boolean {
  return a === b || (sameRoot(singular(a), singular(b)) && wordBase(a) === wordBase(b));
}

/** Word list matched by inflection (`sameWord`): «antibiotic» is in a list with «antibiótico», «pills» in one with «pill». */
export function rootSet(list: Iterable<string>) {
  const byStem = new Map<string, string[]>();
  for (const w of list) {
    const key = stem(singular(w));
    byStem.set(key, [...(byStem.get(key) ?? []), w]);
  }
  return { has: (w: string) => (byStem.get(stem(singular(w))) ?? []).some((x) => sameWord(x, w)) };
}

// "MyTherapy", "PillPal": a capital inside a word marks a made-up name.
const CAMEL = /^\p{L}\p{Ll}+\p{Lu}\p{L}*$/u;

/**
 * Brands of other apps, for the prompts and to drop ideas, in two groups: the part of the title before a
 * separator (or the whole title when it is one word) and the developer name without its legal suffix.
 * Without options it behaves as before; with them, ordinary words stop counting as brands:
 * - a title brand needs a proper name: a word that is not a stopword or generic word of the store
 *   language or English, not a common app-title word (`titleCommonWords`: «pills», «reminder», «lady»),
 *   not a word used in COMMON_TITLE_APPS or more distinct titles of the set, and not one of our own words
 *   (title, tracked keywords, product sheet, exceptions). All of them compared by root and without
 *   accents, so «antibiotic» is not a brand when we track «antibiótico» and «registros» is generic;
 * - in a title without a separator, only its capitalised first word or a word like «MyTherapy» can be one;
 * - a title head is never a brand when COMMON_TITLE_APPS or more distinct apps of the set use it;
 * - the developer only if it is not made only of generic words ("Apps Studio").
 */
export function competitorBrandGroups(
  competitors: { title: string; developer: string }[],
  ownDeveloper: string,
  options: BrandOptions = {},
): BrandGroups {
  const own = foldKey(ownDeveloper.replace(LEGAL_SUFFIX, ""));
  const lang = options.lang ?? "en";
  const stop = stopwordsFor(lang);
  const generic = genericWordsFor(lang);
  const ownText = [options.ownTitle ?? "", ...(options.trackedTerms ?? []), options.productTerms ?? ""].map((t) => words(t).join(" "));
  const excludedWords = new Set([...ownText.flatMap((t) => t.split(" ")), ...(options.exceptions ?? []).flatMap(words)]);
  const exceptions = new Set((options.exceptions ?? []).map((e) => words(e).join(" ")));
  const strict = Object.keys(options).length > 0;
  const excluded = (phrase: string) => {
    const ws = phrase.split(" ");
    return exceptions.has(phrase) || ws.every((w) => excludedWords.has(w)) || ownText.some((t) => ` ${t} `.includes(` ${phrase} `));
  };

  // Distinct apps per title phrase: the same app twice in the list counts once.
  const titleWords = [...new Map(competitors.map((c) => [`${foldKey(c.title)}|${foldKey(c.developer)}`, words(c.title)])).values()];
  const titles = titleWords.map((ws) => ` ${ws.join(" ")} `);
  const appsUsing = (phrase: string) => titles.filter((t) => t.includes(` ${phrase} `)).length;

  // Ordinary words, by root: dictionary (store language and English), app-title vocabulary, our own
  // words and the words of many titles. Titles count by inflection too (`sameWord`), never by bare stem:
  // «reminder» in every title does not make the brand «Remindy» common.
  const titlesWithRoot = new Map<string, number>();
  const appsWithRoot = (w: string) => {
    let n = titlesWithRoot.get(w);
    if (n === undefined) titlesWithRoot.set(w, (n = titleWords.filter((ws) => ws.some((x) => sameWord(x, w))).length));
    return n;
  };
  const ordinary = rootSet([...generic, ...titleCommonWords(), ...excludedWords].filter((w) => w.length >= 3));
  const isOrdinary = (w: string) =>
    [...w].length < 3 || /^\d+$/.test(w) || stop.has(w) || ordinary.has(w) || appsWithRoot(w) >= COMMON_TITLE_APPS;
  // First words of each developer's titles: «medisafe» opening two titles of the same developer is its brand.
  const firstWordsBy = new Map<string, Map<string, number>>();
  for (const c of new Map(competitors.map((c) => [`${foldKey(c.title)}|${foldKey(c.developer)}`, c])).values()) {
    const first = words(c.title)[0];
    if (!first) continue;
    const dev = foldKey(c.developer);
    const counts = firstWordsBy.get(dev) ?? new Map<string, number>();
    counts.set(first, (counts.get(first) ?? 0) + 1);
    firstWordsBy.set(dev, counts);
  }

  /**
   * A lowercase first word («medisafe pill reminder») has no capital to say it is a name. It still is one
   * (if it is no ordinary word, checked by the caller) when the developer's name has it, when it opens two
   * or more titles of that developer, or when the whole title is lowercase and it is a long word of only
   * this title (MIN_MADE_UP letters or more).
   */
  const lowercaseBrand = (c: { title: string; developer: string }, w: string) => {
    if ([...w].length < 4) return false;
    if (words(c.developer).includes(w)) return true;
    if ((firstWordsBy.get(foldKey(c.developer))?.get(w) ?? 0) >= 2) return true;
    return !/\p{Lu}/u.test(c.title) && [...w].length >= MIN_MADE_UP && appsWithRoot(w) <= 1;
  };

  const brands = new Set<string>();
  const developers = new Set<string>();
  for (const c of competitors) {
    const parts = c.title.split(TITLE_SEPARATOR);
    const head = foldKey(parts[0]);
    if (!strict) {
      if (parts.length > 1 || !head.includes(" ")) brands.add(head);
    } else if (parts.length > 1 || !head.includes(" ")) {
      const phrase = words(head).join(" ");
      if (phrase && !excluded(phrase) && appsUsing(phrase) < COMMON_TITLE_APPS && phrase.split(" ").some((w) => !isOrdinary(w))) brands.add(head);
    } else {
      // "Medisafe Recordatorio Pastillas": a capitalised first word that is no ordinary word is the brand;
      // "Lady Pill Reminder" has none. Elsewhere in the title only a made-up name like "MyTherapy" counts.
      const raw = parts[0].trim().split(/\s+/);
      raw.forEach((token, i) => {
        const clean = token.replace(/[^\p{L}\p{N}]+/gu, "");
        const w = foldKey(clean);
        const proper = i === 0 ? (/^\p{Lu}/u.test(clean) && [...w].length >= 4) || lowercaseBrand(c, w) : CAMEL.test(clean);
        if (proper && !isOrdinary(w) && !excluded(w)) brands.add(w);
      });
    }
    const developer = foldKey(c.developer.replace(LEGAL_SUFFIX, ""));
    if (developer && developer !== own) {
      const ws = words(developer);
      const genericName = ws.every((w) => DEVELOPER_FILLER.has(w) || stop.has(w) || generic.has(w));
      if (!strict || (!genericName && !excluded(ws.join(" ")))) developers.add(developer);
    }
  }
  const keep = (set: Set<string>) => [...set].filter((b) => b.length >= 3);
  return { brands: keep(brands), developers: keep(developers).filter((d) => !brands.has(d)) };
}

/** Every brand of `competitorBrandGroups`, titles and developers together: what the prompts avoid and the idea filter drops. */
export function competitorBrands(competitors: { title: string; developer: string }[], ownDeveloper: string, options: BrandOptions = {}): string[] {
  const { brands, developers } = competitorBrandGroups(competitors, ownDeveloper, options);
  return [...brands, ...developers];
}

/** Apps of the TOP 5 of our keywords, most frequent first, without our own app. */
export function topCompetitors<T extends { id: string }>(rows: { top5: T[] }[], ownStoreId: string, limit = 25): T[] {
  const counts = new Map<string, { app: T; n: number }>();
  for (const r of rows) {
    for (const a of r.top5) {
      if (a.id === ownStoreId) continue;
      const entry = counts.get(a.id) ?? { app: a, n: 0 };
      entry.n++;
      counts.set(a.id, entry);
    }
  }
  return [...counts.values()].sort((x, y) => y.n - x.n).slice(0, limit).map((e) => e.app);
}

const containsPhrase = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

/** Variant key so "zapatillas running" and "zapatilla running" count as the same keyword. */
const variantKey = (term: string) =>
  foldKey(term)
    .split(" ")
    .map((w) => (w.length > 3 ? w.replace(/(es|s)$/, "") : w))
    .sort()
    .join(" ");

export type FilterResult = { kept: Suggestion[]; dropped: { keyword: string; why: "invalid" | "duplicate" | "existing" | "brand" }[] };

/** Validates the model output and drops invalid items, duplicates, tracked keywords and other brands. */
export function filterSuggestions(output: ModelOutput, existing: string[], brands: string[]): FilterResult {
  const seen = new Set(existing.map(variantKey));
  const foldedBrands = brands.map(foldKey);
  const kept: Suggestion[] = [];
  const dropped: FilterResult["dropped"] = [];
  for (const raw of output.suggestions) {
    const parsed = suggestionSchema.safeParse(raw);
    if (!parsed.success) {
      dropped.push({ keyword: String(raw.keyword), why: "invalid" });
      continue;
    }
    const s = parsed.data;
    const key = variantKey(s.keyword);
    if (existing.some((e) => normalizeKeyword(e) === s.keyword)) {
      dropped.push({ keyword: s.keyword, why: "existing" });
    } else if (seen.has(key)) {
      dropped.push({ keyword: s.keyword, why: "duplicate" });
    } else if (foldedBrands.some((b) => containsPhrase(foldKey(s.keyword), b))) {
      dropped.push({ keyword: s.keyword, why: "brand" });
    } else {
      seen.add(key);
      kept.push(s);
      if (kept.length === MAX_SUGGESTIONS) break;
    }
  }
  return { kept, dropped };
}

/** Words from the title and category used as autocomplete seeds. */
export function seedWords(title: string, category: string | null, max = 4): string[] {
  const words = foldKey(`${title.split(TITLE_SEPARATOR).slice(1).join(" ") || title} ${category ?? ""}`)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4);
  return [...new Set(words)].slice(0, max);
}

/** Factor for a keyword nobody has rated yet: a little above relevance 1 (0.6), well below 5 (1). */
export const UNRATED_RELEVANCE_FACTOR = 0.7;

/**
 * Relevance 1–5 → factor for the opportunity score (0.6–1). Unrated keywords count as 0.7, so a popular
 * generic word added by hand no longer beats a central phrase rated 5.
 */
export function relevanceFactor(relevance: number | null | undefined): number {
  if (relevance == null) return UNRATED_RELEVANCE_FACTOR;
  return 0.5 + Math.min(5, Math.max(1, relevance)) / 10;
}
