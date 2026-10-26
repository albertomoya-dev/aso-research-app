export type Country = { code: string; name: string; lang: string; storefront: number };

// Storefronts with both App Store and Google Play. `lang` is the language passed
// to Google Play; the App Store uses each storefront's default language.
// `storefront` is the App Store front id, needed by the autocomplete endpoint.
export const COUNTRIES: Country[] = [
  { code: "es", name: "España", lang: "es", storefront: 143454 },
  { code: "mx", name: "México", lang: "es", storefront: 143468 },
  { code: "ar", name: "Argentina", lang: "es", storefront: 143505 },
  { code: "co", name: "Colombia", lang: "es", storefront: 143501 },
  { code: "cl", name: "Chile", lang: "es", storefront: 143483 },
  { code: "pe", name: "Perú", lang: "es", storefront: 143507 },
  { code: "ec", name: "Ecuador", lang: "es", storefront: 143509 },
  { code: "uy", name: "Uruguay", lang: "es", storefront: 143514 },
  { code: "py", name: "Paraguay", lang: "es", storefront: 143513 },
  { code: "bo", name: "Bolivia", lang: "es", storefront: 143556 },
  { code: "ve", name: "Venezuela", lang: "es", storefront: 143502 },
  { code: "cr", name: "Costa Rica", lang: "es", storefront: 143495 },
  { code: "pa", name: "Panamá", lang: "es", storefront: 143485 },
  { code: "gt", name: "Guatemala", lang: "es", storefront: 143504 },
  { code: "do", name: "República Dominicana", lang: "es", storefront: 143508 },
  { code: "us", name: "Estados Unidos", lang: "en", storefront: 143441 },
  { code: "gb", name: "Reino Unido", lang: "en", storefront: 143444 },
  { code: "ca", name: "Canadá", lang: "en", storefront: 143455 },
  { code: "au", name: "Australia", lang: "en", storefront: 143460 },
  { code: "nz", name: "Nueva Zelanda", lang: "en", storefront: 143461 },
  { code: "ie", name: "Irlanda", lang: "en", storefront: 143449 },
  { code: "in", name: "India", lang: "en", storefront: 143467 },
  { code: "za", name: "Sudáfrica", lang: "en", storefront: 143472 },
  { code: "ng", name: "Nigeria", lang: "en", storefront: 143561 },
  { code: "ph", name: "Filipinas", lang: "en", storefront: 143474 },
  { code: "sg", name: "Singapur", lang: "en", storefront: 143464 },
  { code: "br", name: "Brasil", lang: "pt", storefront: 143503 },
  { code: "pt", name: "Portugal", lang: "pt", storefront: 143453 },
  { code: "fr", name: "Francia", lang: "fr", storefront: 143442 },
  { code: "be", name: "Bélgica", lang: "fr", storefront: 143446 },
  { code: "ch", name: "Suiza", lang: "de", storefront: 143459 },
  { code: "de", name: "Alemania", lang: "de", storefront: 143443 },
  { code: "at", name: "Austria", lang: "de", storefront: 143445 },
  { code: "it", name: "Italia", lang: "it", storefront: 143450 },
  { code: "nl", name: "Países Bajos", lang: "nl", storefront: 143452 },
  { code: "se", name: "Suecia", lang: "sv", storefront: 143456 },
  { code: "no", name: "Noruega", lang: "no", storefront: 143457 },
  { code: "dk", name: "Dinamarca", lang: "da", storefront: 143458 },
  { code: "fi", name: "Finlandia", lang: "fi", storefront: 143447 },
  { code: "pl", name: "Polonia", lang: "pl", storefront: 143478 },
  { code: "cz", name: "Chequia", lang: "cs", storefront: 143489 },
  { code: "ro", name: "Rumanía", lang: "ro", storefront: 143487 },
  { code: "hu", name: "Hungría", lang: "hu", storefront: 143482 },
  { code: "gr", name: "Grecia", lang: "el", storefront: 143448 },
  { code: "tr", name: "Turquía", lang: "tr", storefront: 143480 },
  { code: "ua", name: "Ucrania", lang: "uk", storefront: 143492 },
  { code: "il", name: "Israel", lang: "he", storefront: 143491 },
  { code: "sa", name: "Arabia Saudí", lang: "ar", storefront: 143479 },
  { code: "ae", name: "Emiratos Árabes Unidos", lang: "ar", storefront: 143481 },
  { code: "eg", name: "Egipto", lang: "ar", storefront: 143516 },
  { code: "jp", name: "Japón", lang: "ja", storefront: 143462 },
  { code: "kr", name: "Corea del Sur", lang: "ko", storefront: 143466 },
  { code: "tw", name: "Taiwán", lang: "zh-TW", storefront: 143470 },
  { code: "hk", name: "Hong Kong", lang: "zh-HK", storefront: 143463 },
  { code: "th", name: "Tailandia", lang: "th", storefront: 143475 },
  { code: "vn", name: "Vietnam", lang: "vi", storefront: 143471 },
  { code: "id", name: "Indonesia", lang: "id", storefront: 143476 },
  { code: "my", name: "Malasia", lang: "ms", storefront: 143473 },
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
