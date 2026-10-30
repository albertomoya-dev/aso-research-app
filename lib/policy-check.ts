import type { FieldKey, Issue, IssueLevel, MetadataDraft } from "./metadata-check";
import { stopwordsFor } from "./stopwords";
import type { Store } from "./stores/types";
import { fold } from "./text";

/*
 * Store policy checker. Each rule keeps the link to the official text and the date it was checked.
 * Store rules change: when you touch a rule, read the source again and update `reviewedAt`.
 *
 * Sources read on 2026-10-30 (downloaded and read in full, not from memory):
 * - Google Play, Metadata policy: answer/9898842 (title, icon and developer name: no emojis, no ALL CAPS
 *   unless brand, no repeated special characters, no store performance, ranking, price or promotional
 *   text, no Google Play programs such as "New"; no unattributed or anonymous testimonials; no word
 *   blocks or keyword lists; avoid repetitive or unrelated keywords).
 * - Google Play, Health Content and Services: answer/16679511 (Health apps declaration form in Play
 *   Console; no misleading claims of preventing, curing or treating; "not a medical device…" disclaimer
 *   and a reminder to consult a healthcare professional).
 * - App Store Review Guidelines (last updated 16 Oct 2026): 2.3.7 (no trademarked terms, popular app
 *   names or pricing in metadata; subtitles must not reference other apps or make unverifiable product
 *   claims) and 1.4.1 (medical apps should remind users to check with a doctor).
 * - Apple, "Creating your product page": keyword field without plurals of words already there,
 *   category names, the word "app" or competing app names; no specific prices in the description.
 *
 * Calls to action ("descarga ya") are not named literally in today's Play policy: the rule is a
 * warning derived from "misleading, non-descriptive" title text, not a quote.
 */

export const REVIEWED_AT = "2026-10-30";
export const POLICY_LINKS = {
  playMetadata: "https://support.google.com/googleplay/android-developer/answer/9898842",
  playHealth: "https://support.google.com/googleplay/android-developer/answer/16679511",
  appleMetadata: "https://developer.apple.com/app-store/review/guidelines/#accurate-metadata",
  appleMedical: "https://developer.apple.com/app-store/review/guidelines/#1.4.1",
  appleProductPage: "https://developer.apple.com/app-store/product-page/",
} as const;

/** Google Play description: a keyword phrase repeated more than this many times reads as stuffing. The optimizer prompt asks for 2–3. */
export const MAX_DESCRIPTION_REPEATS = 3;
/** Single words are naturally more frequent: warn above this many per 1000 characters (and more than 6 times). */
export const WORD_DENSITY_PER_1000 = 4;

export type PolicyContext = {
  /** Store language ("es"). Without it, the promo terms of every supported language are checked. */
  lang?: string;
  /** Store category, to turn on the health rules ("Medicina", "Medical", "Health & Fitness"…). */
  category?: string | null;
  /** Tracked keywords, for the keyword density rule. */
  keywords?: string[];
  /** Other apps' brands (from `competitorBrands`), never to be mentioned. */
  brands?: string[];
  /** Own brand, allowed in capitals. Defaults to the part of the title before a separator. */
  ownBrand?: string;
};

export type RuleContext = PolicyContext & { store: Store; draft: MetadataDraft; field: FieldKey };

export type PolicyRule = {
  id: string;
  store: Store | "both";
  field: FieldKey | FieldKey[];
  level: IssueLevel;
  /** What breaks the rule in the text (shown in the message); empty when the text is fine. */
  test: (text: string, ctx: RuleContext) => string[];
  /** Spanish text for the «Avisos» panel. */
  message: (matches: string[], fieldLabel: string) => string;
  link: string;
  reviewedAt: string;
};

// ---------- Helpers ----------

const LABELS: Record<FieldKey, Record<Store, string>> = {
  title: { ios: "Nombre", android: "Título" },
  subtitle: { ios: "Subtítulo", android: "Subtítulo" },
  keywordField: { ios: "Campo de keywords", android: "Campo de keywords" },
  shortDescription: { ios: "Descripción corta", android: "Descripción corta" },
  description: { ios: "Descripción", android: "Descripción" },
};

const words = (s: string) => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const charLength = (s: string) => [...s].length;
const quote = (items: string[]) => items.map((m) => `«${m}»`).join(", ");
const unique = (items: string[]) => [...new Set(items)];
const clip = (s: string, max = 60) => (charLength(s) > max ? `${[...s].slice(0, max).join("")}…` : s);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Times the phrase appears in the text, word by word. */
function countPhrase(text: string, phrase: string): number {
  const hay = words(text);
  const needle = words(phrase);
  if (!needle.length) return 0;
  let n = 0;
  for (let i = 0; i + needle.length <= hay.length; i++) if (needle.every((w, j) => hay[i + j] === w)) n++;
  return n;
}
const hasPhrase = (text: string, phrase: string) => countPhrase(text, phrase) > 0;

/** Whole-term matcher on folded text; terms may start or end with symbols ("#1", "% off"). */
function matcher(terms: string[]): (text: string) => string[] {
  if (!terms.length) return () => [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.map((t) => escape(fold(t))).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  return (text) => unique([...fold(text).matchAll(re)].map((m) => m[0]));
}

const NUMBER_ONE = /(?<![\p{L}\p{N}])(?:#\s?1|n\s?[º°]\s?1|n\.\s?º\s?1|no\.\s?1|nr\.?\s?1|numero\s(?:1|uno|um|un)|number\s(?:1|one)|nummer\s(?:1|eins)|top\s?1)(?!\p{N})/gu;
const numberOne = (text: string) => unique([...fold(text).matchAll(NUMBER_ONE)].map((m) => m[0]));

type Lang = "es" | "en" | "pt" | "fr" | "de" | "it";
type TermList = Record<Lang, string[]>;

/** Store performance or ranking ("mejor", "top"); "#1" and the like are matched by NUMBER_ONE. */
const RANKING: TermList = {
  es: ["mejor", "mejores", "top", "lider", "popular", "app del ano", "premiada", "galardonada", "eleccion del editor"],
  en: ["best", "top", "popular", "app of the year", "award winning", "award-winning", "editor's choice", "editors choice"],
  pt: ["melhor", "melhores", "top", "popular", "premiado", "premiada"],
  fr: ["meilleur", "meilleure", "meilleures", "top", "populaire", "choix de la redaction"],
  de: ["beste", "bester", "bestes", "top", "beliebt", "beliebteste"],
  it: ["migliore", "migliori", "top", "popolare", "scelta dell'editore"],
};
/** Price or promotion. */
const PRICE: TermList = {
  es: ["gratis", "gratuito", "gratuita", "oferta", "ofertas", "descuento", "descuentos", "rebaja", "rebajas", "promocion", "bonificacion", "% dto"],
  en: ["free", "sale", "discount", "deal", "deals", "offer", "bonus", "cashback", "cash back", "% off"],
  pt: ["gratis", "gratuito", "gratuita", "oferta", "desconto", "promocao", "bonus"],
  fr: ["gratuit", "gratuite", "offre", "promo", "promotion", "remise", "soldes", "bonus"],
  de: ["gratis", "kostenlos", "kostenlose", "angebot", "rabatt", "sale", "bonus"],
  it: ["gratis", "gratuito", "gratuita", "offerta", "sconto", "saldi", "promozione", "bonus"],
};
/** Words that suggest a Google Play program or a launch ("New"). */
const NEW: TermList = {
  es: ["nuevo", "nueva", "novedad"],
  en: ["new"],
  pt: ["novo", "nova", "novidade"],
  fr: ["nouveau", "nouvelle"],
  de: ["neu", "neue", "neues"],
  it: ["nuovo", "nuova", "novita"],
};
/** Strong ranking claims, flagged in the long description too ("la mejor app"). */
const RANKING_CLAIMS: TermList = {
  es: ["la mejor app", "la mejor aplicacion", "el mejor pastillero", "app del ano", "lider del mercado"],
  en: ["the best app", "best app", "app of the year", "market leader"],
  pt: ["o melhor app", "melhor app", "melhor aplicativo"],
  fr: ["la meilleure app", "la meilleure application", "meilleure app"],
  de: ["die beste app", "beste app"],
  it: ["la migliore app", "migliore app"],
};
const CTA: TermList = {
  es: ["descarga ya", "descargala ya", "descargala ahora", "descarga ahora", "descargar ahora", "instala ya", "instalala ya", "instala ahora", "pruebala ya", "pruebala ahora", "actualiza ya", "actualiza ahora"],
  en: ["download now", "download today", "install now", "get it now", "try it now", "try now", "play now", "update now"],
  pt: ["baixe ja", "baixe agora", "instale agora", "experimente agora"],
  fr: ["telechargez maintenant", "telecharge maintenant", "installez maintenant", "essayez maintenant"],
  de: ["jetzt herunterladen", "jetzt installieren", "jetzt laden", "jetzt testen"],
  it: ["scarica ora", "scaricala ora", "installa ora", "prova ora"],
};

const LANGS: Lang[] = ["es", "en", "pt", "fr", "de", "it"];
/** Terms of the store language plus English (it shows up in listings everywhere); every language without one. */
function termsFor(list: TermList, lang?: string): string[] {
  const langs = lang && LANGS.includes(lang as Lang) ? unique([lang, "en"]) : LANGS;
  return unique(langs.flatMap((l) => list[l as Lang]));
}
/**
 * Promo terms in the text, without the app's own brand: «Top Recetas: cocina fácil» or a brand with
 * «Free» in it is not a claim. Only a brand we can be sure of counts: the given one or the title
 * before a separator, never the first word of a plain title («Mejor recordatorio»).
 */
const find = (lists: TermList[], text: string, ctx: RuleContext, extra?: (t: string) => string[]) => {
  const t = withoutOwnBrand(text, ctx);
  return unique([...matcher(lists.flatMap((l) => termsFor(l, ctx.lang)))(t), ...(extra?.(t) ?? [])]);
};

// Emojis and emoticons. ©, ® and ™ are pictographic in Unicode but legitimate in brand names.
const EMOTICON = /(?<!\S)(?:[:;=][-']?[)(\]\[DPpOo3|/\\]|<3|\^_?\^|xD|XD|T_T|:'\()(?!\S)/g;
function emojis(text: string): string[] {
  const pics = [...text].filter((ch) => /\p{Extended_Pictographic}/u.test(ch) && !"©®™".includes(ch));
  return unique([...pics, ...[...text.matchAll(EMOTICON)].map((m) => m[0])]);
}

const DECORATIVE = /[★☆✩✪✫✬✭✮✯✰✓✔✗✘❤♥♡❣►▶◀◄▷◁•●○◉◆◇■□▪▫♦♣♠♤♧♢→←↑↓⇒⇐⇨➔➜➤➡⬅✦✧✱✲✳❖※〜～]/gu;
const REPEATED = /([!?¡¿*#~=+_.\-/\\$%&@^])\1+/g;
const symbols = (text: string) => unique([...[...text.matchAll(DECORATIVE)].map((m) => m[0]), ...[...text.matchAll(REPEATED)].map((m) => m[0])]);

const SEPARATOR = /\s*(?::|\s[-–—|·]\s)\s*/;
/** Own brand: the given one, or the title before a separator ("Runly: Correr" → "Runly"), or its first word. */
function ownBrand(ctx: RuleContext): string {
  if (ctx.ownBrand) return ctx.ownBrand;
  const parts = ctx.draft.title.split(SEPARATOR);
  return (parts.length > 1 ? parts[0] : ctx.draft.title.trim().split(/\s+/)[0]) ?? "";
}
const brandWords = (ctx: RuleContext) => new Set(words(ownBrand(ctx)));

/** The text folded, with the declared brand (or the title before a separator) blanked out. */
function withoutOwnBrand(text: string, ctx: RuleContext): string {
  const parts = ctx.draft.title.split(SEPARATOR);
  const brand = fold(ctx.ownBrand || (parts.length > 1 ? parts[0] : "")).trim();
  if (!brand) return text;
  return fold(text).replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(brand)}(?![\\p{L}\\p{N}])`, "gu"), " ");
}

/** Runs of capitals outside the brand: two or more words in a row, or one word of 6+ letters. */
function sustainedCaps(text: string, ctx: RuleContext): string[] {
  const brand = brandWords(ctx);
  const isCaps = (w: string) => /\p{L}/u.test(w) && w === w.toLocaleUpperCase() && w !== w.toLocaleLowerCase() && [...w].length >= 2;
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2 || (run.length === 1 && [...run[0].replace(/\P{L}/gu, "")].length >= 6)) out.push(run.join(" "));
    run = [];
  };
  for (const w of text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    if (isCaps(w) && !brand.has(fold(w))) run.push(w);
    else flush();
  }
  flush();
  return out;
}

/** Keyword phrases repeated too often in the description (Google Play reads it as stuffing). */
function densityMatches(text: string, ctx: RuleContext): string[] {
  const chars = Math.max(charLength(text), 1000);
  return unique(ctx.keywords ?? [])
    .map((k) => {
      const count = countPhrase(text, k);
      const per1000 = (count * 1000) / chars;
      const single = words(k).length === 1;
      const over = single ? count > 6 && per1000 > WORD_DENSITY_PER_1000 : count > MAX_DESCRIPTION_REPEATS;
      return over ? `${k} (${count} veces, ${per1000.toLocaleString("es-ES", { maximumFractionDigits: 1 })} por cada 1000 caracteres)` : null;
    })
    .filter((m): m is string => m != null);
}

const LIST_LABEL = /^(keywords?|palabras clave|tags|etiquetas|mots[- ]cles|schlusselworter|parole chiave)\s*:/;
const BULLET = /^[\s•·\-*–—►▶✓✔]+/;
/** Word blocks: "keywords:" lines, horizontal lists of 6+ short items without a sentence, or 6+ lines of one or two words. */
function keywordLists(text: string): string[] {
  const out: string[] = [];
  let vertical: string[] = [];
  const flush = () => {
    if (vertical.length >= 6) out.push(clip(vertical.join(", ")));
    vertical = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.replace(BULLET, "").trim();
    if (!line) {
      flush();
      continue;
    }
    if (LIST_LABEL.test(fold(line))) out.push(clip(line));
    const items = line.split(/\s*[,;|·/]\s*/).filter(Boolean);
    if (items.length >= 6 && items.every((i) => i.split(/\s+/).length <= 3) && !/[.!?…]$/.test(line)) out.push(clip(line));
    if (line.split(/\s+/).length <= 2 && !/[.!?:…]$/.test(line)) vertical.push(line);
    else flush();
  }
  flush();
  return unique(out);
}

const STARS = /[★⭐]\s*[★⭐]|(?<![\p{L}\p{N}])(?:5|cinco|five|cinq|funf|cinque)\s+(?:estrellas|stars|etoiles|sterne|stelle|estrelas)(?![\p{L}])/u;
const ANONYMOUS_QUOTE =
  /["“«„][^"”»“]{12,200}["”»“]\s*(?:[-–—―]\s*(?:(?:un|una|a|an|um|uma)\s+)?(?:usuari[oa]s?|user|cliente|customer|anonim[oa]|anonymous|resena|review|utilisateur|nutzer|utente)?\s*)?$/u;
/** Reviews pasted without a name: lines with stars, or a quote signed "— usuario" or not signed at all. A named source ("— El País") passes. */
function testimonials(text: string): string[] {
  return unique(
    text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => STARS.test(fold(l)) || ANONYMOUS_QUOTE.test(fold(l)))
      .map((l) => clip(l)),
  );
}

function brandsIn(text: string, ctx: RuleContext, wholeWordsOnly = false): string[] {
  const own = words(ownBrand(ctx)).join(" ");
  return unique(
    (ctx.brands ?? []).filter((b) => {
      const key = words(b).join(" ");
      if (!key || key === own) return false;
      if (!wholeWordsOnly) return hasPhrase(text, b);
      const have = new Set(words(text));
      return words(b).every((w) => have.has(w));
    }),
  );
}

// ---------- Health ----------

const HEALTH_CATEGORY = ["medic", "medecin", "health", "salud", "sante", "saude", "gesundheit", "medizin", "salute"];
/** Medical or health category, in any of the store languages. */
export function isHealthCategory(category: string | null | undefined): boolean {
  const c = fold(category ?? "");
  return HEALTH_CATEGORY.some((h) => c.includes(h));
}

/** Claims of curing or diagnosing on their own. */
const CURE_WORDS = [
  "cura", "curan", "curar", "curara", "diagnostica", "diagnostican", "diagnosticar",
  "cure", "cures", "cured", "heals", "diagnose", "diagnoses",
  "guerit", "guerir", "diagnostique", "diagnostiquer",
  "heilt", "heilen", "diagnostiziert",
  "curare", "guarisce", "diagnosticare",
];
/** Treating or preventing only counts as a claim next to a disease. */
const TREAT_WORDS = ["trata", "tratar", "previene", "prevenir", "combate", "elimina", "treat", "treats", "prevent", "prevents", "fights", "traite", "previent", "behandelt", "verhindert", "tratta", "previene", "previne"];
const DISEASES = [
  "enfermedad", "enfermedades", "diabetes", "cancer", "hipertension", "depresion", "ansiedad", "infeccion", "infecciones", "alzheimer", "covid",
  "disease", "diseases", "hypertension", "depression", "anxiety", "infection", "infections",
  "doenca", "doencas", "maladie", "maladies", "krankheit", "krankheiten", "malattia", "malattie",
];
/** Sentences with these are disclaimers, not claims ("no diagnostica", "consulta a tu médico"). */
const NEGATION = new Set(["no", "not", "never", "nunca", "ni", "sin", "nao", "pas", "ne", "nicht", "kein", "keine", "non", "doesn", "don", "without"]);
const DISCLAIMER = [
  "no sustituye", "no reemplaza", "no es un dispositivo medico", "consulta a tu medico", "consulta con tu medico", "consulta siempre", "profesional sanitario",
  "consejo medico", "consejo de tu medico", "not a substitute", "does not replace", "not a medical device", "consult your doctor", "consult a doctor",
  "healthcare professional", "medical advice", "nao substitui", "consulte seu medico", "ne remplace pas", "ersetzt nicht", "ersetzt keine", "non sostituisce",
];
function healthClaims(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/[.!?¡¿\n]+/)) {
    const ws = words(sentence);
    if (!ws.length || ws.some((w) => NEGATION.has(w)) || DISCLAIMER.some((d) => hasPhrase(sentence, d))) continue;
    ws.forEach((w, i) => {
      if (CURE_WORDS.includes(w)) out.push(w);
      else if (TREAT_WORDS.includes(w) && ws.slice(i + 1, i + 5).some((n) => DISEASES.includes(n))) out.push(ws.slice(i, i + 5).join(" "));
    });
  }
  return unique(out);
}
const hasDisclaimer = (text: string) => DISCLAIMER.some((d) => hasPhrase(text, d));

// ---------- App Store keyword field ----------

function redundantPlurals(field: string, ctx: RuleContext): string[] {
  const kw = unique(words(field));
  const base = new Set([...kw, ...words(ctx.draft.title), ...words(ctx.draft.subtitle)]);
  return kw.filter((w) => (w.endsWith("es") && base.has(w.slice(0, -2))) || (w.endsWith("s") && base.has(w.slice(0, -1))));
}

function categoryWords(field: string, ctx: RuleContext): string[] {
  const stop = stopwordsFor(ctx.lang ?? "en");
  const category = words(ctx.category ?? "").filter((w) => w.length >= 3 && !stop.has(w));
  const banned = new Set([...category, "app", "apps", "aplicacion", "application", "aplicativo"]);
  return unique(words(field).filter((w) => banned.has(w)));
}

// ---------- Rules ----------

const reviewed = REVIEWED_AT;
const L = POLICY_LINKS;

export const POLICY_RULES: PolicyRule[] = [
  {
    id: "play.title.emoji",
    store: "android",
    field: "title",
    level: "error",
    test: (t) => emojis(t),
    message: (m, f) => `${f}: Google Play no permite emojis ni emoticonos en el título: ${m.join(" ")}.`,
    link: L.playMetadata,
    reviewedAt: reviewed,
  },
  {
    id: "play.title.symbols",
    store: "android",
    field: "title",
    level: "error",
    test: (t) => symbols(t),
    message: (m, f) => `${f}: quita los símbolos decorativos o repetidos (${m.join(" ")}); Google Play no los permite en el título.`,
    link: L.playMetadata,
    reviewedAt: reviewed,
  },
  {
    id: "play.title.caps",
    store: "android",
    field: "title",
    level: "warn",
    test: (t, ctx) => sustainedCaps(t, ctx),
    message: (m, f) => `${f}: evita las MAYÚSCULAS sostenidas si no son parte de la marca: ${quote(m)}.`,
    link: L.playMetadata,
    reviewedAt: reviewed,
  },
  {
    id: "play.title.promo",
    store: "android",
    field: "title",
    level: "error",
    test: (t, ctx) => find([RANKING, PRICE, NEW], t, ctx, numberOne),
    message: (m, f) =>
      `${f}: Google Play no permite términos de rendimiento, ranking, precio, promoción o «nuevo» en el título: ${quote(m)}.`,
    link: L.playMetadata,
    reviewedAt: reviewed,
  },
  {
    id: "play.short.promo",
    store: "android",
    field: "shortDescription",
    level: "warn",
    test: (t, ctx) => find([RANKING, PRICE], t, ctx, numberOne),
    message: (m, f) => `${f}: suena a reclamo (${quote(m)}). La norma lo prohíbe en el título y Google desaconseja las afirmaciones de este tipo en la ficha.`,
    link: L.playMetadata,
    reviewedAt: reviewed,
  },
  {
    id: "play.description.promo",
    store: "android",
    field: "description",
    level: "warn",
    test: (t, ctx) => find([PRICE, RANKING_CLAIMS], t, ctx, numberOne),
    message: (m, f) =>
      `${f}: términos de precio, promoción o ranking (${quote(m)}). En el título están prohibidos; en la descripción, Google pide no usar afirmaciones engañosas como «la mejor app».`,
    link: L.playMetadata,
    reviewedAt: reviewed,
  },
  {
    id: "play.title.cta",
    store: "android",
    field: ["title", "shortDescription"],
    level: "warn",
    test: (t, ctx) => find([CTA], t, ctx),
    message: (m, f) => `${f}: quita las llamadas a la acción (${quote(m)}); el texto debe describir la app.`,
    link: L.playMetadata,
    reviewedAt: reviewed,
  },
  {
    id: "play.description.density",
    store: "android",
    field: "description",
    level: "warn",
    test: (t, ctx) => densityMatches(t, ctx),
    message: (m, f) =>
      `${f}: densidad alta de keywords (Google puede verlo como relleno; más de ${MAX_DESCRIPTION_REPEATS} veces por frase): ${m.join("; ")}.`,
    link: L.playMetadata,
    reviewedAt: reviewed,
  },
  {
    id: "play.description.keyword-list",
    store: "android",
    field: ["shortDescription", "description"],
    level: "warn",
    test: (t) => keywordLists(t),
    message: (m, f) => `${f}: parece una lista de palabras clave sin frases (Google Play no permite bloques de palabras): ${quote(m)}.`,
    link: L.playMetadata,
    reviewedAt: reviewed,
  },
  {
    id: "play.description.testimonial",
    store: "android",
    field: "description",
    level: "warn",
    test: (t) => testimonials(t),
    message: (m, f) => `${f}: parece un testimonio sin atribuir o anónimo, que Google Play no permite: ${quote(m)}.`,
    link: L.playMetadata,
    reviewedAt: reviewed,
  },
  {
    id: "other-apps",
    store: "both",
    field: ["title", "subtitle", "shortDescription", "description"],
    level: "warn",
    test: (t, ctx) => brandsIn(t, ctx),
    message: (m, f) => `${f}: menciona otras apps o marcas (${quote(m)}). Quítalas salvo que tengas permiso.`,
    link: L.playMetadata,
    reviewedAt: reviewed,
  },
  {
    id: "play.health.declaration",
    store: "android",
    field: "title",
    level: "info",
    test: (_t, ctx) => (isHealthCategory(ctx.category) ? ["salud"] : []),
    message: () =>
      "App de salud: Google exige rellenar la declaración de apps de salud en Play Console (Supervisar y mejorar › Política › Contenido de la app).",
    link: L.playHealth,
    reviewedAt: reviewed,
  },
  {
    id: "health.claims",
    store: "both",
    field: ["title", "subtitle", "shortDescription", "description"],
    level: "warn",
    test: (t, ctx) => (isHealthCategory(ctx.category) ? healthClaims(t) : []),
    message: (m, f) => `${f}: evita afirmar que la app diagnostica, cura, trata o previene enfermedades: ${quote(m)}.`,
    link: L.playHealth,
    reviewedAt: reviewed,
  },
  {
    id: "health.disclaimer",
    store: "both",
    field: "description",
    level: "info",
    test: (t, ctx) => (isHealthCategory(ctx.category) && t.trim() && !hasDisclaimer(t) ? ["aviso"] : []),
    message: (_m, f) =>
      `${f}: añade un aviso de que la app no es un dispositivo médico y no sustituye el consejo médico, y recuerda consultar a un profesional sanitario.`,
    link: L.playHealth,
    reviewedAt: reviewed,
  },
  {
    id: "ios.name.price",
    store: "ios",
    field: ["title", "subtitle"],
    level: "error",
    test: (t, ctx) => find([PRICE], t, ctx),
    message: (m, f) => `${f}: Apple no permite precios ni promociones en el nombre o el subtítulo: ${quote(m)}.`,
    link: L.appleMetadata,
    reviewedAt: reviewed,
  },
  {
    id: "ios.name.claims",
    store: "ios",
    field: ["title", "subtitle"],
    level: "warn",
    test: (t, ctx) => find([RANKING], t, ctx, numberOne),
    message: (m, f) => `${f}: Apple pide no hacer afirmaciones que no se puedan comprobar: ${quote(m)}.`,
    link: L.appleMetadata,
    reviewedAt: reviewed,
  },
  {
    id: "ios.description.price",
    store: "ios",
    field: "description",
    level: "warn",
    test: (t) => unique([...t.matchAll(/(?:[€$£]\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:€|\$|£|eur|usd)(?![\p{L}]))/giu)].map((m) => m[0])),
    message: (m, f) => `${f}: evita precios concretos (${quote(m)}); la tienda ya los muestra y pueden no ser exactos en todos los países.`,
    link: L.appleProductPage,
    reviewedAt: reviewed,
  },
  {
    id: "ios.keywords.plural",
    store: "ios",
    field: "keywordField",
    level: "warn",
    test: (t, ctx) => redundantPlurals(t, ctx),
    message: (m, f) => `${f}: plurales de palabras que ya están en singular, gastan caracteres: ${m.join(", ")}.`,
    link: L.appleProductPage,
    reviewedAt: reviewed,
  },
  {
    id: "ios.keywords.category",
    store: "ios",
    field: "keywordField",
    level: "warn",
    test: (t, ctx) => categoryWords(t, ctx),
    message: (m, f) => `${f}: el nombre de la categoría y la palabra «app» no hacen falta: ${m.join(", ")}.`,
    link: L.appleProductPage,
    reviewedAt: reviewed,
  },
  {
    id: "ios.keywords.other-apps",
    store: "ios",
    field: "keywordField",
    level: "error",
    test: (t, ctx) => brandsIn(t, ctx, true),
    message: (m, f) => `${f}: Apple no permite nombres de otras apps o marcas en las keywords: ${m.join(", ")}.`,
    link: L.appleMetadata,
    reviewedAt: reviewed,
  },
];

/** Policy issues of a listing, in rule order. Fields of the other store are ignored. */
export function policyCheck(store: Store, draft: MetadataDraft, ctx: PolicyContext = {}, rules: PolicyRule[] = POLICY_RULES): Issue[] {
  const issues: Issue[] = [];
  for (const rule of rules) {
    if (rule.store !== "both" && rule.store !== store) continue;
    const fields = Array.isArray(rule.field) ? rule.field : [rule.field];
    for (const field of fields) {
      if (!STORE_FIELDS[store].includes(field)) continue;
      const text = draft[field] ?? "";
      const matches = text.trim() || rule.id === "play.health.declaration" ? rule.test(text, { ...ctx, store, draft, field }) : [];
      if (matches.length) issues.push({ level: rule.level, text: rule.message(matches, LABELS[field][store]), ruleId: rule.id, link: rule.link });
    }
  }
  return issues;
}

/** Same as FIELDS in metadata-check, kept here so this module has no runtime import from it. */
const STORE_FIELDS: Record<Store, FieldKey[]> = {
  ios: ["title", "subtitle", "keywordField", "description"],
  android: ["title", "shortDescription", "description"],
};
