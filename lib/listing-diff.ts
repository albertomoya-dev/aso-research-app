import type { AppMeta } from "./stores/types";

/** The parts of a listing that a competitor changes on purpose. Ratings move every day and are kept apart. */
export type Listing = Pick<
  AppMeta,
  "title" | "shortDescription" | "description" | "version" | "releaseNotes" | "icon" | "screenshots" | "price" | "category"
>;

export function toListing(meta: AppMeta): Listing {
  return {
    title: meta.title,
    shortDescription: meta.shortDescription,
    description: meta.description,
    version: meta.version,
    releaseNotes: meta.releaseNotes,
    icon: meta.icon,
    screenshots: meta.screenshots,
    price: meta.price,
    category: meta.category,
  };
}

export type ListingChange =
  | { field: "title" | "shortDescription" | "description"; label: string; kind: "text"; before: string; after: string; added: string[]; removed: string[] }
  | { field: "version" | "price" | "category"; label: string; kind: "value"; before: string; after: string }
  | { field: "icon"; label: string; kind: "image"; before: string; after: string }
  | { field: "screenshots"; label: string; kind: "count"; before: number; after: number };

const TEXT_FIELDS = [
  { field: "title", label: "Título" },
  { field: "shortDescription", label: "Descripción corta" },
  { field: "description", label: "Descripción" },
] as const;
const VALUE_FIELDS = [
  { field: "version", label: "Versión" },
  { field: "price", label: "Precio" },
  { field: "category", label: "Categoría" },
] as const;

const words = (s: string) =>
  s
    .normalize("NFC")
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);

/** Distinct words in `b` that are not in `a`. */
function newWords(a: string, b: string): string[] {
  const before = new Set(words(a));
  return [...new Set(words(b).filter((w) => !before.has(w)))];
}

/**
 * Field-by-field changes between two snapshots. Release notes are not compared:
 * they change with every version and the version change already says so.
 */
export function diffListings(prev: Listing, next: Listing): ListingChange[] {
  const changes: ListingChange[] = [];
  for (const { field, label } of TEXT_FIELDS) {
    const before = prev[field] ?? "";
    const after = next[field] ?? "";
    if (before.trim() !== after.trim()) {
      changes.push({ field, label, kind: "text", before, after, added: newWords(before, after), removed: newWords(after, before) });
    }
  }
  for (const { field, label } of VALUE_FIELDS) {
    const before = prev[field] ?? "";
    const after = next[field] ?? "";
    if (before !== after) changes.push({ field, label, kind: "value", before, after });
  }
  // Icon URLs carry a size suffix that can change without a new icon; compare the path before it.
  const iconKey = (url: string) => url.replace(/\/\d+x\d+\w*\.\w+$/, "").replace(/=[swh]\d+.*$/, "");
  if (iconKey(prev.icon) !== iconKey(next.icon)) changes.push({ field: "icon", label: "Icono", kind: "image", before: prev.icon, after: next.icon });
  const shots = (l: Listing) => l.screenshots.map(iconKey).join("|");
  if (shots(prev) !== shots(next)) {
    changes.push({ field: "screenshots", label: "Capturas", kind: "count", before: prev.screenshots.length, after: next.screenshots.length });
  }
  return changes;
}
