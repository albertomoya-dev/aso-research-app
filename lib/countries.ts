export type Country = { code: string; name: string; lang: string };

// Storefronts with both App Store and Google Play. `lang` is the language passed
// to Google Play; the App Store uses each storefront's default language.
export const COUNTRIES: Country[] = [
  { code: "es", name: "España", lang: "es" },
  { code: "mx", name: "México", lang: "es" },
  { code: "ar", name: "Argentina", lang: "es" },
  { code: "co", name: "Colombia", lang: "es" },
  { code: "cl", name: "Chile", lang: "es" },
  { code: "pe", name: "Perú", lang: "es" },
  { code: "ec", name: "Ecuador", lang: "es" },
  { code: "uy", name: "Uruguay", lang: "es" },
  { code: "py", name: "Paraguay", lang: "es" },
  { code: "bo", name: "Bolivia", lang: "es" },
  { code: "ve", name: "Venezuela", lang: "es" },
  { code: "cr", name: "Costa Rica", lang: "es" },
  { code: "pa", name: "Panamá", lang: "es" },
  { code: "gt", name: "Guatemala", lang: "es" },
  { code: "do", name: "República Dominicana", lang: "es" },
  { code: "us", name: "Estados Unidos", lang: "en" },
  { code: "gb", name: "Reino Unido", lang: "en" },
  { code: "ca", name: "Canadá", lang: "en" },
  { code: "au", name: "Australia", lang: "en" },
  { code: "nz", name: "Nueva Zelanda", lang: "en" },
  { code: "ie", name: "Irlanda", lang: "en" },
  { code: "in", name: "India", lang: "en" },
  { code: "za", name: "Sudáfrica", lang: "en" },
  { code: "ng", name: "Nigeria", lang: "en" },
  { code: "ph", name: "Filipinas", lang: "en" },
  { code: "sg", name: "Singapur", lang: "en" },
  { code: "br", name: "Brasil", lang: "pt" },
  { code: "pt", name: "Portugal", lang: "pt" },
  { code: "fr", name: "Francia", lang: "fr" },
  { code: "be", name: "Bélgica", lang: "fr" },
  { code: "ch", name: "Suiza", lang: "de" },
  { code: "de", name: "Alemania", lang: "de" },
  { code: "at", name: "Austria", lang: "de" },
  { code: "it", name: "Italia", lang: "it" },
  { code: "nl", name: "Países Bajos", lang: "nl" },
  { code: "se", name: "Suecia", lang: "sv" },
  { code: "no", name: "Noruega", lang: "no" },
  { code: "dk", name: "Dinamarca", lang: "da" },
  { code: "fi", name: "Finlandia", lang: "fi" },
  { code: "pl", name: "Polonia", lang: "pl" },
  { code: "cz", name: "Chequia", lang: "cs" },
  { code: "ro", name: "Rumanía", lang: "ro" },
  { code: "hu", name: "Hungría", lang: "hu" },
  { code: "gr", name: "Grecia", lang: "el" },
  { code: "tr", name: "Turquía", lang: "tr" },
  { code: "ua", name: "Ucrania", lang: "uk" },
  { code: "il", name: "Israel", lang: "he" },
  { code: "sa", name: "Arabia Saudí", lang: "ar" },
  { code: "ae", name: "Emiratos Árabes Unidos", lang: "ar" },
  { code: "eg", name: "Egipto", lang: "ar" },
  { code: "jp", name: "Japón", lang: "ja" },
  { code: "kr", name: "Corea del Sur", lang: "ko" },
  { code: "tw", name: "Taiwán", lang: "zh-TW" },
  { code: "hk", name: "Hong Kong", lang: "zh-HK" },
  { code: "th", name: "Tailandia", lang: "th" },
  { code: "vn", name: "Vietnam", lang: "vi" },
  { code: "id", name: "Indonesia", lang: "id" },
  { code: "my", name: "Malasia", lang: "ms" },
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
