import { genericWordsFor, stopwordsFor } from "./stopwords";
import type { AppMeta } from "./stores/types";
import { fold } from "./text";

/** Apps read per search: the first page a user sees. */
export const TOP_DEPTH = 10;
/** "All my keywords" searches at most this many, so the page stays fast. */
export const MAX_SEED_KEYWORDS = 8;
export const MAX_TERMS = 200;
const MAX_WORDS = 3;

export type ListingField = "title" | "short" | "description";

/** The store fields of one top app, already trimmed to what is indexed. */
export type TopListing = { id: string; title: string; short: string; description: string };

export type TopTerm = {
  term: string;
  words: number;
  /** Apps whose listing contains the term anywhere. */
  apps: number;
  inTitle: number;
  /** App Store subtitle is not public, so this is the Google Play short description. */
  inShort: number;
  occurrences: number;
  appIds: string[];
  score: number;
};

const FIELD_WEIGHT: Record<ListingField, number> = { title: 3, short: 2, description: 1 };

/** Words of each clause: n-grams never cross punctuation or line breaks. */
function clauses(text: string): string[][] {
  return text
    .toLocaleLowerCase()
    .split(/[\n\r.,;:!?¡¿•·|()[\]{}"«»“”/\\–—]+|\s-\s/u)
    .map((c) => c.split(/[^\p{L}\p{N}'’&+-]+/u).map((w) => w.replace(/^[-'’]+|[-'’]+$/g, "")).filter(Boolean));
}

const usable = (word: string, stop: Set<string>) => !stop.has(fold(word)) && !/^\d+$/.test(word) && [...word].length >= 2;

/**
 * Every 1–3 word phrase that neither starts nor ends with a stopword, keyed by its folded form.
 * Generic description words ("datos", "experiencia") may sit in a phrase but are never a term alone.
 */
export function phrases(text: string, stop: Set<string>, generic: Set<string> = new Set()): { key: string; display: string }[] {
  const out: { key: string; display: string }[] = [];
  for (const words of clauses(text)) {
    for (let i = 0; i < words.length; i++) {
      if (!usable(words[i], stop)) continue;
      for (let n = 1; n <= MAX_WORDS && i + n <= words.length; n++) {
        const last = words[i + n - 1];
        if (!usable(last, stop)) continue;
        if (n === 1 && ([...last].length < 3 || generic.has(fold(last)))) continue;
        const slice = words.slice(i, i + n);
        out.push({ key: slice.map(fold).join(" "), display: slice.join(" ") });
      }
    }
  }
  return out;
}

export function toTopListing(meta: AppMeta): TopListing {
  return { id: meta.id, title: meta.title, short: meta.shortDescription ?? "", description: meta.description ?? "" };
}

/**
 * Terms the top apps share in their listings. A term counts once per app, weighted by the
 * strongest field holding it (title > short description > description). Terms found in a
 * single app are dropped: they are usually brand names. A shorter term that only ever
 * appears inside one longer term is dropped in favour of the longer one.
 */
export function extractTopTerms(listings: TopListing[], options: { lang: string; exclude?: Iterable<string>; minApps?: number }): TopTerm[] {
  const stop = stopwordsFor(options.lang);
  const generic = genericWordsFor(options.lang);
  const minApps = options.minApps ?? (listings.length > 2 ? 2 : 1);
  const exclude = new Set([...(options.exclude ?? [])].map(fold));

  type Acc = { displays: Map<string, number>; best: Map<string, ListingField>; occurrences: number; inTitle: Set<string>; inShort: Set<string> };
  const terms = new Map<string, Acc>();

  for (const listing of listings) {
    for (const field of ["title", "short", "description"] as const) {
      for (const { key, display } of phrases(listing[field], stop, generic)) {
        let acc = terms.get(key);
        if (!acc) terms.set(key, (acc = { displays: new Map(), best: new Map(), occurrences: 0, inTitle: new Set(), inShort: new Set() }));
        acc.displays.set(display, (acc.displays.get(display) ?? 0) + 1);
        acc.occurrences++;
        const prev = acc.best.get(listing.id);
        if (!prev || FIELD_WEIGHT[field] > FIELD_WEIGHT[prev]) acc.best.set(listing.id, field);
        if (field === "title") acc.inTitle.add(listing.id);
        if (field === "short") acc.inShort.add(listing.id);
      }
    }
  }

  let result: TopTerm[] = [];
  for (const [key, acc] of terms) {
    if (acc.best.size < minApps || exclude.has(key)) continue;
    const display = [...acc.displays].sort((a, b) => b[1] - a[1])[0][0];
    const words = key.split(" ").length;
    const fieldScore = [...acc.best.values()].reduce((sum, f) => sum + FIELD_WEIGHT[f], 0);
    result.push({
      term: display,
      words,
      apps: acc.best.size,
      inTitle: acc.inTitle.size,
      inShort: acc.inShort.size,
      occurrences: acc.occurrences,
      appIds: [...acc.best.keys()],
      // Phrases are rarer than single words, so a shared phrase is a stronger signal.
      score: Math.round(fieldScore * (1 + 0.25 * (words - 1)) * 10) / 10,
    });
  }

  const keyOf = (t: TopTerm) => t.term.split(" ").map(fold).join(" ");
  const longer = result.filter((t) => t.words > 1);
  result = result.filter((t) => {
    const k = ` ${keyOf(t)} `;
    return !longer.some((l) => l.words > t.words && l.apps === t.apps && l.occurrences === t.occurrences && ` ${keyOf(l)} `.includes(k));
  });

  return result
    .sort((a, b) => b.score - a.score || b.apps - a.apps || b.occurrences - a.occurrences || a.term.localeCompare(b.term))
    .slice(0, MAX_TERMS);
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with a header row, ready for a spreadsheet or another ASO tool. */
export function toCsv(terms: TopTerm[], appCount: number, titles: Record<string, string>): string {
  const header = ["keyword", "palabras", "puntuacion", `apps (de ${appCount})`, "en titulo", "en descripcion corta", "apariciones", "apps que la usan"];
  const rows = terms.map((t) => [t.term, t.words, t.score, t.apps, t.inTitle, t.inShort, t.occurrences, t.appIds.map((id) => titles[id] ?? id).join(" | ")]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
