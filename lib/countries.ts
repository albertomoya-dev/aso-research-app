export type Country = {
  code: string;
  name: string;
  lang: string;
  /** Main listing locale of the country (BCP 47, language-REGION): the draft the editor opens first. */
  locale: string;
  storefront: number;
  /**
   * App Store localizations this storefront also shows and indexes besides `locale`: Apple's default
   * language for it plus its "additional supported languages". A listing written in one of them also
   * ranks there (for example, Spanish (Mexico) in the United States).
   */
  extraLocales?: string[];
};

// Storefronts with both App Store and Google Play. `lang` is the language passed
// to Google Play; the App Store uses each storefront's default language.
// `storefront` is the App Store front id, needed by the autocomplete endpoint.
//
// `extraLocales` comes from Apple's table "App Store localizations"
// (https://developer.apple.com/help/app-store-connect/reference/app-store-localizations),
// read on 2026-10-30. Apple changes it from time to time: verify before relying on it.
// India lists 11 more languages; only Hindi is kept here. Apple's own codes are kept where
// they have no region (ca, ko, zh-Hans…).
export const COUNTRIES: Country[] = [
  { code: "es", name: "España", lang: "es", locale: "es-ES", storefront: 143454, extraLocales: ["ca", "en-GB"] },
  { code: "mx", name: "México", lang: "es", locale: "es-MX", storefront: 143468, extraLocales: ["en-GB"] },
  { code: "ar", name: "Argentina", lang: "es", locale: "es-AR", storefront: 143505, extraLocales: ["es-MX", "en-GB"] },
  { code: "co", name: "Colombia", lang: "es", locale: "es-CO", storefront: 143501, extraLocales: ["es-MX", "en-GB"] },
  { code: "cl", name: "Chile", lang: "es", locale: "es-CL", storefront: 143483, extraLocales: ["es-MX", "en-GB"] },
  { code: "pe", name: "Perú", lang: "es", locale: "es-PE", storefront: 143507, extraLocales: ["es-MX", "en-GB"] },
  { code: "ec", name: "Ecuador", lang: "es", locale: "es-EC", storefront: 143509, extraLocales: ["es-MX", "en-GB"] },
  { code: "uy", name: "Uruguay", lang: "es", locale: "es-UY", storefront: 143514, extraLocales: ["en-GB", "es-MX"] },
  { code: "py", name: "Paraguay", lang: "es", locale: "es-PY", storefront: 143513, extraLocales: ["es-MX", "en-GB"] },
  { code: "bo", name: "Bolivia", lang: "es", locale: "es-BO", storefront: 143556, extraLocales: ["es-MX", "en-GB"] },
  { code: "ve", name: "Venezuela", lang: "es", locale: "es-VE", storefront: 143502, extraLocales: ["es-MX", "en-GB"] },
  { code: "cr", name: "Costa Rica", lang: "es", locale: "es-CR", storefront: 143495, extraLocales: ["es-MX", "en-GB"] },
  { code: "pa", name: "Panamá", lang: "es", locale: "es-PA", storefront: 143485, extraLocales: ["es-MX", "en-GB"] },
  { code: "gt", name: "Guatemala", lang: "es", locale: "es-GT", storefront: 143504, extraLocales: ["es-MX", "en-GB"] },
  { code: "do", name: "República Dominicana", lang: "es", locale: "es-DO", storefront: 143508, extraLocales: ["es-MX", "en-GB"] },
  { code: "us", name: "Estados Unidos", lang: "en", locale: "en-US", storefront: 143441, extraLocales: ["ar", "zh-Hans", "zh-Hant", "fr-FR", "ko", "pt-BR", "ru", "es-MX", "vi"] },
  { code: "gb", name: "Reino Unido", lang: "en", locale: "en-GB", storefront: 143444 },
  { code: "ca", name: "Canadá", lang: "en", locale: "en-CA", storefront: 143455, extraLocales: ["fr-CA"] },
  { code: "au", name: "Australia", lang: "en", locale: "en-AU", storefront: 143460, extraLocales: ["en-GB"] },
  { code: "nz", name: "Nueva Zelanda", lang: "en", locale: "en-NZ", storefront: 143461, extraLocales: ["en-AU", "en-GB"] },
  { code: "ie", name: "Irlanda", lang: "en", locale: "en-IE", storefront: 143449, extraLocales: ["en-GB"] },
  { code: "in", name: "India", lang: "en", locale: "en-IN", storefront: 143467, extraLocales: ["en-GB", "hi"] },
  { code: "za", name: "Sudáfrica", lang: "en", locale: "en-ZA", storefront: 143472, extraLocales: ["en-GB"] },
  { code: "ng", name: "Nigeria", lang: "en", locale: "en-NG", storefront: 143561, extraLocales: ["en-GB"] },
  { code: "ph", name: "Filipinas", lang: "en", locale: "en-PH", storefront: 143474, extraLocales: ["en-GB"] },
  { code: "sg", name: "Singapur", lang: "en", locale: "en-SG", storefront: 143464, extraLocales: ["en-GB", "zh-Hans"] },
  { code: "br", name: "Brasil", lang: "pt", locale: "pt-BR", storefront: 143503, extraLocales: ["en-GB"] },
  { code: "pt", name: "Portugal", lang: "pt", locale: "pt-PT", storefront: 143453, extraLocales: ["en-GB"] },
  { code: "fr", name: "Francia", lang: "fr", locale: "fr-FR", storefront: 143442, extraLocales: ["en-GB"] },
  { code: "be", name: "Bélgica", lang: "fr", locale: "fr-BE", storefront: 143446, extraLocales: ["en-GB", "nl-NL", "fr-FR"] },
  { code: "ch", name: "Suiza", lang: "de", locale: "de-CH", storefront: 143459, extraLocales: ["de-DE", "en-GB", "fr-FR", "it"] },
  { code: "de", name: "Alemania", lang: "de", locale: "de-DE", storefront: 143443, extraLocales: ["en-GB"] },
  { code: "at", name: "Austria", lang: "de", locale: "de-AT", storefront: 143445, extraLocales: ["de-DE", "en-GB"] },
  { code: "it", name: "Italia", lang: "it", locale: "it-IT", storefront: 143450, extraLocales: ["en-GB"] },
  { code: "nl", name: "Países Bajos", lang: "nl", locale: "nl-NL", storefront: 143452, extraLocales: ["en-GB"] },
  { code: "se", name: "Suecia", lang: "sv", locale: "sv-SE", storefront: 143456, extraLocales: ["en-GB"] },
  { code: "no", name: "Noruega", lang: "no", locale: "no-NO", storefront: 143457, extraLocales: ["en-GB"] },
  { code: "dk", name: "Dinamarca", lang: "da", locale: "da-DK", storefront: 143458, extraLocales: ["en-GB"] },
  { code: "fi", name: "Finlandia", lang: "fi", locale: "fi-FI", storefront: 143447, extraLocales: ["en-GB"] },
  { code: "pl", name: "Polonia", lang: "pl", locale: "pl-PL", storefront: 143478, extraLocales: ["en-GB"] },
  { code: "cz", name: "Chequia", lang: "cs", locale: "cs-CZ", storefront: 143489, extraLocales: ["en-GB"] },
  { code: "ro", name: "Rumanía", lang: "ro", locale: "ro-RO", storefront: 143487, extraLocales: ["en-GB"] },
  { code: "hu", name: "Hungría", lang: "hu", locale: "hu-HU", storefront: 143482, extraLocales: ["en-GB"] },
  { code: "gr", name: "Grecia", lang: "el", locale: "el-GR", storefront: 143448, extraLocales: ["en-GB"] },
  { code: "tr", name: "Turquía", lang: "tr", locale: "tr-TR", storefront: 143480, extraLocales: ["en-GB"] },
  { code: "ua", name: "Ucrania", lang: "uk", locale: "uk-UA", storefront: 143492, extraLocales: ["en-GB", "ru"] },
  { code: "il", name: "Israel", lang: "he", locale: "he-IL", storefront: 143491, extraLocales: ["en-GB"] },
  { code: "sa", name: "Arabia Saudí", lang: "ar", locale: "ar-SA", storefront: 143479, extraLocales: ["en-GB"] },
  { code: "ae", name: "Emiratos Árabes Unidos", lang: "ar", locale: "ar-AE", storefront: 143481, extraLocales: ["en-GB"] },
  { code: "eg", name: "Egipto", lang: "ar", locale: "ar-EG", storefront: 143516, extraLocales: ["en-GB", "fr-FR"] },
  { code: "jp", name: "Japón", lang: "ja", locale: "ja-JP", storefront: 143462, extraLocales: ["en-US"] },
  { code: "kr", name: "Corea del Sur", lang: "ko", locale: "ko-KR", storefront: 143466, extraLocales: ["en-GB"] },
  { code: "tw", name: "Taiwán", lang: "zh-TW", locale: "zh-TW", storefront: 143470, extraLocales: ["zh-Hant", "en-GB"] },
  { code: "hk", name: "Hong Kong", lang: "zh-HK", locale: "zh-HK", storefront: 143463, extraLocales: ["zh-Hant", "en-GB"] },
  { code: "th", name: "Tailandia", lang: "th", locale: "th-TH", storefront: 143475, extraLocales: ["en-GB"] },
  { code: "vn", name: "Vietnam", lang: "vi", locale: "vi-VN", storefront: 143471, extraLocales: ["en-GB"] },
  { code: "id", name: "Indonesia", lang: "id", locale: "id-ID", storefront: 143476, extraLocales: ["en-GB"] },
  { code: "my", name: "Malasia", lang: "ms", locale: "ms-MY", storefront: 143473, extraLocales: ["en-GB"] },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export const DEFAULT_COUNTRY = "es";

export function getCountry(code: string): Country {
  const country = BY_CODE.get(code.toLowerCase());
  if (!country) throw new Error(`País no soportado: ${code}`);
  return country;
}

export function isCountry(code: string): boolean {
  return BY_CODE.has(code.toLowerCase());
}

/** Every country's main locale plus the App Store extra locales, without repeats, in table order. */
export const ALL_LOCALES: string[] = [...new Set(COUNTRIES.flatMap((c) => [c.locale, ...(c.extraLocales ?? [])]))];
