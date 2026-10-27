import type { AppMeta } from "./stores/types";

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

// Short lists of words that never make a keyword on their own, per store language.
const STOPWORDS: Record<string, string> = {
  es: "a al algo algun alguna algunas alguno algunos ante antes asi aun aqui bajo bien cada como con contra cual cuales cuando de del desde donde dos durante e el ella ellas ellos en entre era es esa esas ese eso esos esta estas este esto estos estan esta fue gran ha hace hacer han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos nuestra nuestro nuestros nuestras o os otra otro otros para pero poco por porque puede pueden que quien se sea segun ser si sin sobre solo son su sus tambien tan tanto te ti tiene tienen todo todos todas toda tu tus tuya tuyo u un una unas uno unos usted ustedes vez y ya yo",
  en: "a about after all also an and any app apps are as at be because been but by can could do does for from get gets has have how if in into is it its just like more most my new no not now of on one only or other our out over so some such than that the their them then there these they this to too up us use using very via was we what when where which while who will with without you your yours",
  pt: "a ao aos as com como da das de do dos e ela ele em entre era essa esse esta este eu foi ha isso mais mas me meu minha muito na nas no nos nao o os ou para pela pelo por que se sem seu sua suas sao tambem te tem todo todos tu um uma voce",
  fr: "a au aux avec ce ces dans de des du elle en est et il ils je la le les leur mais me mes mon ne nous on ou par pas plus pour qu que qui sa se ses son sur ta te tes ton tous tout tu un une vos votre vous",
  de: "als am an auf aus bei bin bis das dass dein deine dem den der des die du ein eine einem einen einer es fur hat ich ihr im in ist ja mit nach nicht noch nur oder sein sich sie sind so uber um und uns von vor wie wir zu zum zur",
  it: "a ad al alla alle anche che chi con da dal del della delle di e gli ha i il in la le lo ma mi nel nella non per piu se si sono su sua suo ti tra tu tua tuo un una",
};

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();

export function stopwordsFor(lang: string): Set<string> {
  // English shows up in listings of every country, so it is always filtered.
  return new Set(`${STOPWORDS[lang] ?? ""} ${STOPWORDS.en}`.split(/\s+/).filter(Boolean));
}

/** Words of each clause: n-grams never cross punctuation or line breaks. */
function clauses(text: string): string[][] {
  return text
    .toLocaleLowerCase()
    .split(/[\n\r.,;:!?¡¿•·|()[\]{}"«»“”/\\–—]+|\s-\s/u)
    .map((c) => c.split(/[^\p{L}\p{N}'’&+-]+/u).map((w) => w.replace(/^[-'’]+|[-'’]+$/g, "")).filter(Boolean));
}

const usable = (word: string, stop: Set<string>) => !stop.has(fold(word)) && !/^\d+$/.test(word) && [...word].length >= 2;

/** Every 1–3 word phrase that neither starts nor ends with a stopword, keyed by its folded form. */
export function phrases(text: string, stop: Set<string>): { key: string; display: string }[] {
  const out: { key: string; display: string }[] = [];
  for (const words of clauses(text)) {
    for (let i = 0; i < words.length; i++) {
      if (!usable(words[i], stop)) continue;
      for (let n = 1; n <= MAX_WORDS && i + n <= words.length; n++) {
        const last = words[i + n - 1];
        if (!usable(last, stop)) continue;
        if (n === 1 && [...last].length < 3) continue;
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
  const minApps = options.minApps ?? (listings.length > 2 ? 2 : 1);
  const exclude = new Set([...(options.exclude ?? [])].map(fold));

  type Acc = { displays: Map<string, number>; best: Map<string, ListingField>; occurrences: number; inTitle: Set<string>; inShort: Set<string> };
  const terms = new Map<string, Acc>();

  for (const listing of listings) {
    for (const field of ["title", "short", "description"] as const) {
      for (const { key, display } of phrases(listing[field], stop)) {
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
