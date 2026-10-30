import { localeLanguage } from "../listing-drafts";

/**
 * Languages a Google Play store listing can be translated into, with Play's own codes.
 * Source: "Add translations and localized assets" (Play Console Help), list of supported languages,
 * https://support.google.com/googleplay/android-developer/answer/9844778 — read on 2026-10-30.
 * Play uses some codes of its own: "es-419" (Latin America), "iw-IL" (Hebrew), "zh-CN"/"zh-TW".
 */
export const PLAY_LANGUAGES = [
  "af", "sq", "am", "ar", "hy-AM", "az-AZ", "bn-BD", "eu-ES", "be", "bg", "my-MM", "ca", "zh-HK", "zh-CN", "zh-TW", "hr", "cs-CZ",
  "da-DK", "nl-NL", "en-AU", "en-CA", "en-US", "en-GB", "en-IN", "en-SG", "en-ZA", "et", "fil", "fi-FI", "fr-CA", "fr-FR", "gl-ES",
  "ka-GE", "de-DE", "el-GR", "gu", "iw-IL", "hi-IN", "hu-HU", "is-IS", "id", "it-IT", "ja-JP", "kn-IN", "kk", "km-KH", "ko-KR",
  "ky-KG", "lo-LA", "lv", "lt", "mk-MK", "ms-MY", "ms", "ml-IN", "mr-IN", "mn-MN", "ne-NP", "no-NO", "fa", "fa-AE", "fa-AF", "fa-IR",
  "pl-PL", "pt-BR", "pt-PT", "pa", "ro", "rm", "ru-RU", "sr", "si-LK", "sk", "sl", "es-419", "es-ES", "es-US", "sw", "sv-SE", "ta-IN",
  "te-IN", "th", "tr-TR", "uk", "ur", "vi", "zu",
] as const;

const SUPPORTED = new Set<string>(PLAY_LANGUAGES);

/** Rankeo locales with a Play code that the generic rules below would not find. */
const ALIASES: Record<string, string> = {
  he: "iw-IL",
  "he-IL": "iw-IL",
  "zh-Hans": "zh-CN",
  "zh-Hant": "zh-TW",
};

export type PlayLanguage = { code: string; note: string | null };

/**
 * Play listing language for a Rankeo locale (BCP 47), or null when Play has no listing for it.
 *
 * - Exact codes pass through ("es-ES", "en-GB", "pt-BR").
 * - Spanish of any Latin American country ("es-MX", "es-AR"…) goes to Play's single "es-419" listing.
 * - A regional locale whose language Play only has without region goes to that one ("ro-RO" → "ro",
 *   "ar-SA" → "ar", "uk-UA" → "uk"): Play shows it in every country.
 * - A bare language with a single regional code in Play takes it ("ko" → "ko-KR", "ru" → "ru-RU").
 * - Anything else (for example "en-NZ", "de-AT", "fr-BE") is null: Play has no listing for that
 *   variant, and mapping it to another one ("de-DE") would overwrite a listing that other countries see.
 */
export function toPlayLanguage(locale: string): PlayLanguage | null {
  if (SUPPORTED.has(locale)) return { code: locale, note: null };
  const alias = ALIASES[locale];
  if (alias) return { code: alias, note: `Google Play usa el código ${alias} para este idioma.` };
  const lang = localeLanguage(locale);
  const region = locale.split("-")[1];
  if (lang === "es" && region && region !== "ES" && region !== "US") {
    return { code: "es-419", note: "Google Play tiene una sola ficha para el español de Latinoamérica (es-419): la ven todos esos países." };
  }
  if (region && SUPPORTED.has(lang)) return { code: lang, note: `Google Play tiene una sola ficha para este idioma (${lang}), sin variante por país.` };
  if (!region) {
    const regional = PLAY_LANGUAGES.filter((c) => c.startsWith(`${lang}-`));
    if (regional.length === 1) return { code: regional[0], note: null };
  }
  return null;
}

/** Play codes of the same language, to suggest when a locale has no Play listing ("en-NZ" → en-AU, en-GB…). */
export function playAlternatives(locale: string): string[] {
  const lang = localeLanguage(locale) === "he" ? "iw" : localeLanguage(locale);
  return PLAY_LANGUAGES.filter((c) => c === lang || c.startsWith(`${lang}-`));
}
