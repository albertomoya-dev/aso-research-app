import { type ListingChange, newWords } from "./listing-diff";
import type { PublicationStatus, PublishedField } from "./publications";
import type { Store } from "./stores/types";
import { fold } from "./text";

// Annotations on the position chart (F8). Pure helpers: the label and the stored diff of an automatic
// annotation, and which tracked keywords a change can affect. The queries live in lib/annotation-queries.ts.

export const ANNOTATION_SOURCES = ["manual", "auto", "publish"] as const;
/** manual: written by the user. auto: the daily job saw the listing change. publish: sent from Rankeo to a console. */
export type AnnotationSource = (typeof ANNOTATION_SOURCES)[number];

export const ANNOTATION_SOURCE_LABEL: Record<AnnotationSource, string> = {
  manual: "Manual",
  auto: "Automática",
  publish: "Publicación",
};

/** One changed field, without the full texts (the listing snapshot keeps them). */
export type AnnotationChange = {
  field: string;
  label: string;
  /** Words that appeared or disappeared, for text fields. */
  added?: string[];
  removed?: string[];
  /** Old and new value, for short values (version, price, category, number of screenshots). */
  before?: string;
  after?: string;
};

export type AnnotationDetail = {
  kind: "listing" | "publish";
  changes: AnnotationChange[];
  /** Version in the store after the change (listing) or nothing (publish). */
  version?: string | null;
  store?: Store;
  locale?: string;
  status?: PublicationStatus;
};

/** Longest label the manual form accepts; automatic ones follow the same limit. */
export const MAX_ANNOTATION_LABEL = 120;

const clip = (s: string) => (s.length > MAX_ANNOTATION_LABEL ? `${s.slice(0, MAX_ANNOTATION_LABEL - 1)}…` : s);

/** «título, descripción corta y capturas». */
function joinLabels(labels: string[]): string {
  const lower = labels.map((l) => l.charAt(0).toLocaleLowerCase() + l.slice(1));
  if (lower.length <= 1) return lower.join("");
  return `${lower.slice(0, -1).join(", ")} y ${lower.at(-1)}`;
}

function toChange(c: ListingChange): AnnotationChange {
  switch (c.kind) {
    case "text":
      return { field: c.field, label: c.label, added: c.added, removed: c.removed };
    case "count":
      return { field: c.field, label: c.label, before: String(c.before), after: String(c.after) };
    default:
      return { field: c.field, label: c.label, before: c.before, after: c.after };
  }
}

/**
 * Label and detail of the annotation for a change seen in the own listing. «Ficha: título y descripción
 * cambiaron (v3.0)»; a version bump alone reads «Nueva versión 3.0». Null when nothing changed.
 */
export function listingAnnotation(changes: ListingChange[]): { label: string; detail: AnnotationDetail } | null {
  if (changes.length === 0) return null;
  const version = changes.find((c) => c.field === "version");
  const versionAfter = version && version.kind === "value" ? version.after : null;
  const others = changes.filter((c) => c.field !== "version");
  let label: string;
  if (others.length === 0) {
    label = versionAfter ? `Nueva versión ${versionAfter}` : "Nueva versión";
  } else {
    const verb = others.length === 1 ? "cambió" : "cambiaron";
    label = `Ficha: ${joinLabels(others.map((c) => c.label))} ${verb}${versionAfter ? ` (v${versionAfter})` : ""}`;
  }
  return { label: clip(label), detail: { kind: "listing", changes: changes.map(toChange), version: versionAfter } };
}

const STORE_VERB: Record<Store, string> = { android: "Enviado a Google Play", ios: "Guardado en App Store Connect" };

/** Label and detail of the annotation for a successful publication. Null for a failed one or one that changed nothing. */
export function publishAnnotation(p: {
  store: Store;
  locale: string;
  status: PublicationStatus;
  fields: PublishedField[];
}): { label: string; detail: AnnotationDetail } | null {
  if (p.status === "failed" || p.fields.length === 0) return null;
  const label = `${STORE_VERB[p.store]} (${p.locale}): ${joinLabels(p.fields.map((f) => f.label))}`;
  const changes = p.fields.map((f) => ({ field: f.field, label: f.label, added: newWords(f.before, f.after), removed: newWords(f.after, f.before) }));
  return { label: clip(label), detail: { kind: "publish", changes, store: p.store, locale: p.locale, status: p.status } };
}

/** Folded words added or removed in any text field of the change. */
export function changedWords(detail: AnnotationDetail | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const c of detail?.changes ?? []) for (const w of [...(c.added ?? []), ...(c.removed ?? [])]) out.add(fold(w));
  return out;
}

const termWords = (term: string) => fold(term).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);

/** Keywords that contain at least one word added or removed by the change (the ones whose ranking it can move). */
export function affectedKeywords<K extends { term: string }>(keywords: K[], detail: AnnotationDetail | null | undefined): K[] {
  const words = changedWords(detail);
  if (words.size === 0) return [];
  return keywords.filter((k) => termWords(k.term).some((w) => words.has(w)));
}
