import type { AppMeta, Store } from "./stores/types";

export type MetadataDraft = {
  title: string;
  subtitle: string;
  /** App Store only: the hidden 100-character keyword field. */
  keywordField: string;
  shortDescription: string;
  description: string;
};
export type FieldKey = keyof MetadataDraft;

export type FieldSpec = { key: FieldKey; label: string; limit: number; indexed: boolean; multiline?: boolean; hint?: string };

/** Store limits; in the App Store the description is not used for search. */
export const FIELDS: Record<Store, FieldSpec[]> = {
  ios: [
    { key: "title", label: "Nombre", limit: 30, indexed: true },
    { key: "subtitle", label: "Subtítulo", limit: 30, indexed: true },
    {
      key: "keywordField",
      label: "Campo de keywords",
      limit: 100,
      indexed: true,
      hint: "Palabras sueltas separadas por comas, sin espacios. No repitas las del nombre ni el subtítulo.",
    },
    { key: "description", label: "Descripción", limit: 4000, indexed: false, multiline: true, hint: "Apple no la usa para la búsqueda." },
  ],
  android: [
    { key: "title", label: "Título", limit: 30, indexed: true },
    { key: "shortDescription", label: "Descripción corta", limit: 80, indexed: true },
    { key: "description", label: "Descripción", limit: 4000, indexed: true, multiline: true },
  ],
};

export function draftFromMeta(meta: AppMeta): MetadataDraft {
  return {
    title: meta.title,
    subtitle: "",
    keywordField: "",
    shortDescription: meta.shortDescription ?? "",
    description: meta.description ?? "",
  };
}

/** Stores count characters, not UTF-16 units. */
export const charCount = (s: string) => [...s].length;

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
export const tokens = (s: string) => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const containsPhrase = (text: string, phrase: string) => ` ${tokens(text).join(" ")} `.includes(` ${tokens(phrase).join(" ")} `);

export type Coverage = {
  term: string;
  /** Every word appears somewhere in the indexed fields. */
  covered: boolean;
  /** Strongest field holding the exact phrase, if any. */
  exactIn: FieldKey | null;
  missing: string[];
  /** Google Play: times the phrase appears in the description. */
  descriptionCount?: number;
};

export type Issue = { level: "error" | "warn"; text: string };

export type MetadataReport = {
  fields: (FieldSpec & { length: number; over: boolean })[];
  coverage: Coverage[];
  issues: Issue[];
  /** App Store: words of the tracked keywords missing everywhere, ready for the keyword field. */
  missingWords: string[];
};

function countPhrase(text: string, phrase: string) {
  const hay = tokens(text);
  const needle = tokens(phrase);
  if (needle.length === 0) return 0;
  let n = 0;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((w, j) => hay[i + j] === w)) n++;
  }
  return n;
}

export function checkMetadata(store: Store, draft: MetadataDraft, keywords: string[]): MetadataReport {
  const specs = FIELDS[store];
  const indexed = specs.filter((f) => f.indexed);
  const fields = specs.map((f) => {
    const length = charCount(draft[f.key]);
    return { ...f, length, over: length > f.limit };
  });
  const indexedWords = new Set(indexed.flatMap((f) => tokens(draft[f.key])));

  const coverage = keywords.map((term): Coverage => {
    const missing = tokens(term).filter((w) => !indexedWords.has(w));
    const exact = indexed.find((f) => containsPhrase(draft[f.key], term));
    return {
      term,
      covered: missing.length === 0,
      exactIn: exact?.key ?? null,
      missing,
      ...(store === "android" ? { descriptionCount: countPhrase(draft.description, term) } : {}),
    };
  });

  const issues: Issue[] = fields
    .filter((f) => f.over)
    .map((f) => ({ level: "error" as const, text: `${f.label}: ${f.length} de ${f.limit} caracteres, sobran ${f.length - f.limit}.` }));

  if (store === "ios") {
    const field = draft.keywordField;
    const spaces = (field.match(/,\s+|\s+,/g) ?? []).reduce((sum, m) => sum + m.length - 1, 0);
    if (spaces > 0) issues.push({ level: "warn", text: `El campo de keywords gasta ${spaces === 1 ? "1 carácter" : `${spaces} caracteres`} en espacios junto a las comas.` });
    const visible = new Set([...tokens(draft.title), ...tokens(draft.subtitle)]);
    const kwWords = tokens(field);
    const repeated = [...new Set(kwWords.filter((w) => visible.has(w)))];
    if (repeated.length > 0) {
      issues.push({ level: "warn", text: `Ya están en el nombre o el subtítulo, quítalas del campo de keywords: ${repeated.join(", ")}.` });
    }
    const dupes = [...new Set(kwWords.filter((w, i) => kwWords.indexOf(w) !== i))];
    if (dupes.length > 0) issues.push({ level: "warn", text: `Palabras repetidas en el campo de keywords: ${dupes.join(", ")}.` });
  } else {
    const stuffed = coverage.filter((c) => (c.descriptionCount ?? 0) > 6);
    if (stuffed.length > 0) {
      issues.push({
        level: "warn",
        text: `Repetidas muchas veces en la descripción (Google puede verlo como relleno): ${stuffed.map((c) => c.term).join(", ")}.`,
      });
    }
  }

  const missingWords = store === "ios" ? [...new Set(coverage.flatMap((c) => c.missing))] : [];
  return { fields, coverage, issues, missingWords };
}

/** Appends words to an App Store keyword field, comma separated with no spaces. */
export function appendToKeywordField(field: string, words: string[]): string {
  const current = field
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
  const have = new Set(current.map(fold));
  return [...current, ...words.filter((w) => !have.has(fold(w)))].join(",");
}
