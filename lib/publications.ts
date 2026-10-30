import { charCount, type MetadataDraft } from "./metadata-check";
import type { Store } from "./stores/types";

// Publishing a saved draft to a store console (F2): which fields go, the preview of what changes, and
// the record kept of every attempt (table `publications`, read by the automatic annotations of phase 22).
// Pure helpers; the queries live in lib/publication-queries.ts.

export type PublishFieldKey =
  // Google Play listing (edits.listings)
  | "title"
  | "shortDescription"
  | "fullDescription"
  // App Store Connect: appInfoLocalizations (name, subtitle) and appStoreVersionLocalizations
  | "name"
  | "subtitle"
  | "keywords"
  | "description"
  | "promotionalText"
  | "whatsNew";

export type PublishFieldSpec = { key: PublishFieldKey; label: string; limit: number; multiline?: boolean };

/** Fields each console accepts from Rankeo, with the store limits (same as lib/metadata-check, plus ASC's extra texts). */
export const PUBLISH_FIELDS: Record<Store, PublishFieldSpec[]> = {
  android: [
    { key: "title", label: "Título", limit: 30 },
    { key: "shortDescription", label: "Descripción corta", limit: 80 },
    { key: "fullDescription", label: "Descripción", limit: 4000, multiline: true },
  ],
  ios: [
    { key: "name", label: "Nombre", limit: 30 },
    { key: "subtitle", label: "Subtítulo", limit: 30 },
    { key: "keywords", label: "Campo de keywords", limit: 100 },
    { key: "description", label: "Descripción", limit: 4000, multiline: true },
    { key: "promotionalText", label: "Texto promocional", limit: 170, multiline: true },
    { key: "whatsNew", label: "Novedades de esta versión", limit: 4000, multiline: true },
  ],
};

export type PublishFields = Partial<Record<PublishFieldKey, string>>;

/** Google Play fields from a saved draft. */
export function playFieldsFromDraft(draft: MetadataDraft): { title: string; shortDescription: string; fullDescription: string } {
  return { title: draft.title.trim(), shortDescription: draft.shortDescription.trim(), fullDescription: draft.description.trim() };
}

/**
 * App Store Connect fields from a saved draft, plus the two texts that only live in the console
 * (promotional text and release notes). An extra left empty or undefined is not sent: it keeps the
 * value already in App Store Connect.
 */
export function ascFieldsFromDraft(draft: MetadataDraft, extras: { promotionalText?: string; whatsNew?: string } = {}): PublishFields {
  const fields: PublishFields = {
    name: draft.title.trim(),
    subtitle: draft.subtitle.trim(),
    keywords: draft.keywordField.trim(),
    description: draft.description.trim(),
  };
  if (extras.promotionalText?.trim()) fields.promotionalText = extras.promotionalText.trim();
  if (extras.whatsNew?.trim()) fields.whatsNew = extras.whatsNew.trim();
  return fields;
}

/** One field that changes; stored as is in publications.fields. */
export type PublishedField = { field: PublishFieldKey; label: string; before: string; after: string };
export type PreviewField = PublishedField & { limit: number; length: number; over: boolean; multiline: boolean };
export type PublishPreview = {
  changes: PreviewField[];
  /** Labels of the fields that stay as they are. */
  unchanged: string[];
  /** Spanish reasons that block the publication (a text over the limit, an empty title). */
  blockers: string[];
};

/**
 * What would change in the store: each field of `next` against the live value (`live` null when the
 * language has no listing yet in the console). Fields absent from `next` are not touched.
 */
export function buildPublishPreview(store: Store, live: PublishFields | null, next: PublishFields): PublishPreview {
  const changes: PreviewField[] = [];
  const unchanged: string[] = [];
  const blockers: string[] = [];
  for (const spec of PUBLISH_FIELDS[store]) {
    const after = next[spec.key];
    if (after === undefined) continue;
    const before = live?.[spec.key] ?? "";
    const length = charCount(after);
    const over = length > spec.limit;
    if (over) blockers.push(`${spec.label}: ${length} de ${spec.limit} caracteres.`);
    if (before.trim() === after.trim()) unchanged.push(spec.label);
    else changes.push({ field: spec.key, label: spec.label, before, after, limit: spec.limit, length, over, multiline: Boolean(spec.multiline) });
  }
  const titleKey = store === "android" ? "title" : "name";
  if (next[titleKey] !== undefined && !next[titleKey]!.trim()) blockers.push(`${store === "android" ? "El título" : "El nombre"} no puede quedar vacío.`);
  return { changes, unchanged, blockers };
}

/** Fields to store in the record: only what changed, without the preview extras. */
export const publishedFields = (changes: PreviewField[]): PublishedField[] => changes.map(({ field, label, before, after }) => ({ field, label, before, after }));

export const PUBLICATION_STATUSES = ["committed", "saved", "failed"] as const;
/**
 * committed: Google Play accepted the edit (it then goes through Google's review).
 * saved: the texts are saved in the App Store version in preparation (not submitted for review).
 * failed: the console rejected it; `error` says why.
 */
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PUBLICATION_STATUS_LABEL: Record<PublicationStatus, string> = {
  committed: "Enviada a Google Play",
  saved: "Guardada en App Store Connect",
  failed: "Falló",
};

/** «Título y Descripción corta» for the confirmation dialog and the result. */
export function fieldList(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} y ${labels.at(-1)}`;
}
