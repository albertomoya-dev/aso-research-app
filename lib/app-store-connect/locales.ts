import { localeLanguage } from "../listing-drafts";

/**
 * Locale codes of App Store Connect metadata.
 * Source: "Managing metadata in your app by using locale shortcodes",
 * https://developer.apple.com/documentation/appstoreconnectapi/managing-metadata-in-your-app-by-using-locale-shortcodes
 * — read on 2026-10-30. Some carry a region and some do not ("es-MX" but "it", "ja", "ko").
 */
export const ASC_LOCALES = [
  "ar-SA", "bn-BD", "ca", "zh-Hans", "zh-Hant", "hr", "cs", "da", "nl-NL", "en-AU", "en-CA", "en-GB", "en-US", "fi", "fr-FR", "fr-CA",
  "de-DE", "el", "gu-IN", "he", "hi", "hu", "id", "it", "ja", "kn-IN", "ko", "ms", "ml-IN", "mr-IN", "no", "or-IN", "pl", "pt-BR",
  "pt-PT", "pa-IN", "ro", "ru", "sk", "sl-SI", "es-MX", "es-ES", "sv", "ta-IN", "te-IN", "th", "tr", "uk", "ur-PK", "vi",
] as const;

const SUPPORTED = new Set<string>(ASC_LOCALES);

const ALIASES: Record<string, string> = {
  "zh-CN": "zh-Hans",
  "zh-SG": "zh-Hans",
  "zh-TW": "zh-Hant",
  "zh-HK": "zh-Hant",
};

export type AscLocale = { code: string; note: string | null };

/**
 * App Store Connect locale for a Rankeo locale, or null when App Store Connect has no such localization.
 *
 * - Exact codes pass through ("es-MX", "en-GB", "zh-Hans").
 * - A regional locale whose language Apple only has without region goes to it ("it-IT" → "it",
 *   "ko-KR" → "ko", "he-IL" → "he").
 * - Arabic of any country goes to Apple's single Arabic localization, "ar-SA"; Chinese by script.
 * - Anything else ("es-AR", "en-NZ", "de-AT") is null: those storefronts show another localization
 *   (es-MX, en-GB, de-DE…), and sending it there would overwrite what other countries see.
 */
export function toAscLocale(locale: string): AscLocale | null {
  if (SUPPORTED.has(locale)) return { code: locale, note: null };
  const alias = ALIASES[locale];
  if (alias) return { code: alias, note: `App Store Connect usa ${alias} para este idioma.` };
  const lang = localeLanguage(locale);
  const region = locale.split("-")[1];
  if (lang === "ar") return { code: "ar-SA", note: "App Store Connect tiene una sola localización en árabe (ar-SA)." };
  if (region && SUPPORTED.has(lang)) return { code: lang, note: `App Store Connect tiene una sola localización para este idioma (${lang}).` };
  return null;
}

/** App Store Connect codes of the same language, to suggest when a locale has none ("es-AR" → es-MX, es-ES). */
export function ascAlternatives(locale: string): string[] {
  const lang = localeLanguage(locale);
  return ASC_LOCALES.filter((c) => c === lang || c.startsWith(`${lang}-`));
}
