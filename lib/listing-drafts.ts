import { ALL_LOCALES, COUNTRIES, getCountry, isCountry } from "./countries";
import { type FieldKey, type MetadataDraft, type ScoredKeyword, weightedCoverage } from "./metadata-check";
import type { Store } from "./stores/types";

// Pure helpers for the per-language drafts (F7). The queries live in lib/listing-draft-queries.ts.

/** Which draft: a locale's main listing (country "") or a Google Play custom store listing for one country. */
export type DraftTarget = { locale: string; country: string };

export const EMPTY_DRAFT: MetadataDraft = { title: "", subtitle: "", keywordField: "", shortDescription: "", description: "" };

/** Main listing locale of the app: the locale of the country it is followed in ("es" → "es-ES"). */
export const mainLocale = (appCountry: string) => getCountry(appCountry).locale;

/** "es-MX" → "es", "zh-Hans" → "zh". */
export const localeLanguage = (locale: string) => locale.split("-")[0].toLowerCase();

/** True when `locale` is a known one: some country's main locale or an App Store extra locale. */
export const isKnownLocale = (locale: string) => ALL_LOCALES.includes(locale);

/**
 * Language code for the store adapters (autocomplete, search): the `lang` of the country whose main
 * locale it is ("zh-TW"), Apple's script codes mapped to Google's, or just the language ("ko").
 */
export function storeLangFor(locale: string): string {
  const country = COUNTRIES.find((c) => c.locale === locale);
  if (country) return country.lang;
  if (locale === "zh-Hans") return "zh-CN";
  if (locale === "zh-Hant") return "zh-TW";
  return localeLanguage(locale);
}

/**
 * Country whose store data (autocomplete, TOP apps) best represents people searching in that locale:
 * the explicit custom listing country, the locale's region ("es-MX" → "mx"), or the first country
 * whose language matches ("ko" → "kr", "ca" → "es"). Null when no supported country speaks it.
 */
export function marketCountryFor(target: DraftTarget): string | null {
  if (target.country && isCountry(target.country)) return target.country.toLowerCase();
  const region = target.locale.split("-")[1];
  if (region && region.length === 2 && isCountry(region)) return region.toLowerCase();
  const lang = localeLanguage(target.locale);
  if (lang === "ca") return "es";
  if (lang === "ru") return "ua";
  if (target.locale === "zh-Hans") return "sg";
  return COUNTRIES.find((c) => localeLanguage(c.locale) === lang)?.code ?? null;
}

/**
 * The draft the editor should open, from the URL (?locale=…&country=…). Anything unknown falls back
 * to the app's main locale; a country (custom store listing) only exists in Google Play.
 */
export function resolveTarget(appCountry: string, store: Store, params: { locale?: string | null; country?: string | null }): DraftTarget {
  const main = mainLocale(appCountry);
  const locale = params.locale && (params.locale === main || isKnownLocale(params.locale)) ? params.locale : main;
  const country = store === "android" && params.country && isCountry(params.country) ? params.country.toLowerCase() : "";
  return { locale, country };
}

export const isMainTarget = (appCountry: string, target: DraftTarget) => target.locale === mainLocale(appCountry) && target.country === "";

/** Same language as the main listing: the app's tracked keywords (in that language) apply to it. */
export const sharesMainLanguage = (appCountry: string, target: DraftTarget) => localeLanguage(target.locale) === localeLanguage(mainLocale(appCountry));

/** URL query for a target, for links and redirects. Empty for the main listing. */
export function targetQuery(appCountry: string, target: DraftTarget): string {
  if (isMainTarget(appCountry, target)) return "";
  const q = new URLSearchParams({ locale: target.locale });
  if (target.country) q.set("country", target.country);
  return `?${q}`;
}

let names: Intl.DisplayNames | null = null;
/** "es-MX" → "español (México)". Falls back to the code when the runtime does not know it. */
export function localeLabel(locale: string): string {
  try {
    names ??= new Intl.DisplayNames(["es"], { type: "language", languageDisplay: "standard" });
    return names.of(locale) ?? locale;
  } catch {
    return locale;
  }
}

/** "inglés (Estados Unidos)" or "español (México) · ficha personalizada para México". */
export function targetLabel(target: DraftTarget): string {
  const label = localeLabel(target.locale);
  return target.country ? `${label} · ficha personalizada para ${getCountry(target.country).name}` : label;
}

export type LocaleOption = DraftTarget & { label: string; kind: "main" | "extra" | "current" | "draft" | "other"; hasDraft: boolean };

/**
 * Locales offered in the editor's selector: the main one, the extra languages the App Store indexes in
 * the app's country (App Store only), the open one (a new custom country listing has no draft yet),
 * every saved draft (custom country listings included) and the rest of the known locales. No repeats,
 * in that order.
 */
export function localeOptions(appCountry: string, store: Store, drafts: DraftTarget[], current?: DraftTarget): LocaleOption[] {
  const main = mainLocale(appCountry);
  const has = (t: DraftTarget) => drafts.some((d) => d.locale === t.locale && d.country === t.country);
  const out: LocaleOption[] = [];
  const seen = new Set<string>();
  const add = (t: DraftTarget, kind: LocaleOption["kind"]) => {
    const key = `${t.locale}|${t.country}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...t, label: targetLabel(t), kind, hasDraft: has(t) });
  };
  add({ locale: main, country: "" }, "main");
  if (store === "ios") for (const l of getCountry(appCountry).extraLocales ?? []) add({ locale: l, country: "" }, "extra");
  if (current) add(current, "current");
  for (const d of drafts) if (store === "android" || d.country === "") add(d, "draft");
  for (const l of [...ALL_LOCALES].sort((a, b) => localeLabel(a).localeCompare(localeLabel(b), "es"))) add({ locale: l, country: "" }, "other");
  return out;
}

/**
 * Starting text for a target with no saved draft: the published listing for the main one; the main
 * draft for a custom country listing in the same language; for another language, an empty listing
 * that keeps only the brand (to be written or adapted with AI).
 */
export function baseDraftFor(appCountry: string, target: DraftTarget, main: MetadataDraft, brand: string): MetadataDraft {
  if (isMainTarget(appCountry, target) || sharesMainLanguage(appCountry, target)) return main;
  return { ...EMPTY_DRAFT, title: brand };
}

// ---------- H11.6: how old is the draft against the published listing ----------

const shortDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (d: Date) => shortDate.format(d);
const toDate = (v: string | Date | null | undefined) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export type DraftAge = { text: string; stale: boolean };

/**
 * «Borrador del 27 oct · la ficha publicada cambió el 29 oct»: stale when the store's last update
 * (meta.updatedAt, the date of the published version) is after the draft was saved, so the draft may
 * undo changes made in the store console. Without that date, says when the listing was last read
 * (metaFetchedAt) and does not claim anything. Null when there is no saved draft.
 */
export function draftAge(
  draftUpdatedAt: string | Date | null | undefined,
  publishedUpdatedAt: string | Date | null | undefined,
  metaFetchedAt?: string | Date | null,
): DraftAge | null {
  const saved = toDate(draftUpdatedAt);
  if (!saved) return null;
  const published = toDate(publishedUpdatedAt);
  const fetched = toDate(metaFetchedAt);
  const head = `Borrador del ${fmt(saved)}`;
  if (published && published.getTime() > saved.getTime()) {
    return {
      stale: true,
      text: `${head} · la ficha publicada cambió el ${fmt(published)}, después de tu borrador. Revísalo antes de publicarlo para no deshacer esos cambios.`,
    };
  }
  if (published) return { stale: false, text: `${head} · la ficha publicada es del ${fmt(published)}, anterior a tu borrador.` };
  return { stale: false, text: fetched ? `${head} · ficha publicada leída el ${fmt(fetched)}.` : head };
}

// ---------- Coverage matrix: locale × keyword ----------

export type MatrixColumn = DraftTarget & { label: string; draft: MetadataDraft; saved: boolean };
export type MatrixCell = { credit: number; field: FieldKey | null; partial: boolean };
export type CoverageMatrix = {
  columns: (Omit<MatrixColumn, "draft"> & { score: number })[];
  rows: { term: string; value: number; cells: MatrixCell[] }[];
};

/**
 * Weighted coverage of each listing (column) for the same keywords (rows, most valuable first, at
 * most `limit`). Same pure function as the editor, so the numbers match. The keywords are those of the
 * app's country: in another language the cells are honestly empty.
 */
export function coverageMatrix(store: Store, columns: MatrixColumn[], keywords: ScoredKeyword[], limit = 25): CoverageMatrix {
  const top = [...keywords]
    .sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1) || a.term.localeCompare(b.term))
    .slice(0, limit);
  const coverages = columns.map((c) => weightedCoverage(store, c.draft, top));
  return {
    columns: columns.map((c, i) => ({ locale: c.locale, country: c.country, label: c.label, saved: c.saved, score: coverages[i].score })),
    rows: top.map((k, r) => ({
      term: k.term,
      value: coverages[0]?.items[r].value ?? Math.max(1, k.opportunity ?? 0),
      cells: coverages.map((cov) => {
        const item = cov.items[r];
        return { credit: item.credit, field: item.fields[0] ?? null, partial: item.partial };
      }),
    })),
  };
}
