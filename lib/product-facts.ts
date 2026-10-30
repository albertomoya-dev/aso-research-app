import { z } from "zod";
import { fold } from "./text";

// No "@/" imports with values here: db/schema.ts imports this file and drizzle-kit loads it without the alias.

/** Where a feature stands. Only shipped (and next_release, for the next version) may reach a listing. */
export const FEATURE_STATUSES = ["shipped", "next_release", "planned", "retired"] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = {
  shipped: "Publicada",
  next_release: "Próxima versión",
  planned: "Planeada",
  retired: "Retirada",
};

/** Which version the AI writes for: the one in the store, or the one about to ship. */
export const FACTS_MODES = ["published", "next"] as const;
export type FactsMode = (typeof FACTS_MODES)[number];

export type ProductFacts = {
  pitch: string;
  audience: string;
  differentiators: string[];
  constraints: string[];
  tone: string;
  languages: string[];
};

export type ProductFeature = {
  name: string;
  summary: string;
  status: FeatureStatus;
  sinceVersion: string | null;
  advertise: boolean;
};

export const EMPTY_FACTS: ProductFacts = { pitch: "", audience: "", differentiators: [], constraints: [], tone: "", languages: [] };

/** Features the listing may describe for that version: shipped always, next_release only for the next one, never planned or retired. */
export function featuresFor<T extends ProductFeature>(features: T[], mode: FactsMode): T[] {
  return features.filter((f) => f.advertise && (f.status === "shipped" || (mode === "next" && f.status === "next_release")));
}

/** True when the owner wrote anything at all: a field or a feature in any status. */
export function hasProductFacts(facts: ProductFacts | null, features: ProductFeature[]): boolean {
  if (features.length > 0) return true;
  if (!facts) return false;
  return Boolean(
    facts.pitch.trim() ||
      facts.audience.trim() ||
      facts.tone.trim() ||
      facts.differentiators.length ||
      facts.constraints.length ||
      facts.languages.length,
  );
}

const bullets = (items: string[]) => items.map((i) => `- ${i}`);

/**
 * The PRODUCT FACTS block the prompts share, or null when the owner has not filled anything in
 * (the prompts then fall back to the published listing, as before).
 */
export function factsForPrompt(facts: ProductFacts | null, features: ProductFeature[], mode: FactsMode): string | null {
  if (!hasProductFacts(facts, features)) return null;
  const f = facts ?? EMPTY_FACTS;
  const listed = featuresFor(features, mode);
  const shipped = listed.filter((x) => x.status === "shipped");
  const next = listed.filter((x) => x.status === "next_release");
  const line = (x: ProductFeature) => `- ${x.name}${x.summary.trim() ? `: ${x.summary.trim()}` : ""}${x.sinceVersion ? ` (since ${x.sinceVersion})` : ""}`;
  // Retired and planned features are named so the model removes them if the current listing still mentions them.
  // Features the owner does not advertise stay out entirely.
  const unavailable = features.filter((x) => x.advertise && (x.status === "retired" || x.status === "planned"));
  const constraints = listed.length
    ? [...f.constraints, "Never promise features that are not listed here, even if the current listing mentions them."]
    : f.constraints;

  return [
    `PRODUCT FACTS (declared by the app owner; the source of truth about what the app does, written for ${mode === "next" ? "the next version, about to ship" : "the version published in the store"}):`,
    f.pitch.trim() ? `What it is: ${f.pitch.trim()}` : null,
    f.audience.trim() ? `Audience: ${f.audience.trim()}` : null,
    f.differentiators.length ? ["Differentiators:", ...bullets(f.differentiators)].join("\n") : null,
    shipped.length ? ["Features available in the published version:", ...shipped.map(line)].join("\n") : null,
    next.length ? ["Features of the next version (the listing is for that version, so present them as available):", ...next.map(line)].join("\n") : null,
    listed.length === 0 ? "Features: none declared for this version; for features, rely only on the current listing." : null,
    unavailable.length
      ? `Do NOT mention (retired or not yet available), and remove them if the current listing mentions them: ${unavailable.map((x) => x.name).join("; ")}.`
      : null,
    constraints.length ? ["Constraints, follow them strictly:", ...bullets(constraints)].join("\n") : null,
    f.tone.trim() ? `Brand tone: ${f.tone.trim()}` : null,
    f.languages.length ? `Languages the app supports: ${f.languages.join(", ")}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// ---------- Form input ----------

/** One item per line, trimmed, no blanks or repeats. */
export function splitLines(text: string, max = 20): string[] {
  return [...new Set(text.split(/\r?\n/).map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean))].slice(0, max);
}

/** Comma or line separated list, e.g. "español, inglés". */
export function splitList(text: string, max = 20): string[] {
  return [...new Set(text.split(/[,\n]/).map((l) => l.trim()).filter(Boolean))].slice(0, max);
}

const shortText = (max: number) => z.string().trim().max(max);

export const factsFormSchema = z.object({
  pitch: shortText(300),
  audience: shortText(300),
  differentiators: z.string().max(3000).transform((t) => splitLines(t)),
  constraints: z.string().max(3000).transform((t) => splitLines(t)),
  tone: shortText(200),
  languages: z.string().max(500).transform((t) => splitList(t)),
});

const versionSchema = z
  .string()
  .trim()
  .max(30)
  .transform((v) => v || null);

export const featureInputSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre a la función.").max(120),
  summary: shortText(300),
  status: z.enum(FEATURE_STATUSES),
  sinceVersion: versionSchema,
  advertise: z.boolean(),
});
export type FeatureInput = z.infer<typeof featureInputSchema>;

const isoDate = z
  .string()
  .trim()
  .transform((d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null));

export const releaseInputSchema = z.object({
  version: z.string().trim().min(1, "Indica el número de versión.").max(30),
  date: isoDate,
  notes: z.string().trim().max(4000),
});
export type ReleaseInput = z.infer<typeof releaseInputSchema>;

// ---------- CHANGELOG import ----------

export const CHANGELOG_PROMPT_VERSION = "chg-1";
export const MAX_CHANGELOG_CHARS = 30_000;

/** Loose on purpose so the structured-output schema stays simple; `cleanChangelogProposal` fixes it up after. */
export const changelogOutputSchema = z.object({
  features: z.array(
    z.object({
      name: z.string(),
      summary: z.string(),
      status: z.enum(FEATURE_STATUSES),
      sinceVersion: z.string(),
      /** Name of the existing feature this one updates, exactly as given, or "". */
      updates: z.string(),
    }),
  ),
  releases: z.array(z.object({ version: z.string(), date: z.string(), notes: z.string() })),
  notes: z.array(z.string()),
});
export type ChangelogOutput = z.infer<typeof changelogOutputSchema>;

export const CHANGELOG_SYSTEM_PROMPT = `You turn an app's CHANGELOG or release notes into a structured feature list for an App Store Optimization tool. The owner reviews every item before saving it, so be accurate rather than exhaustive.

Rules:
- One item per user-facing capability, not per commit. Merge small fixes into the feature they improve; skip pure bug fixes, refactors, dependency bumps and internal tooling.
- name: 2 to 8 words in Spanish, the way a user would call the feature. summary: one Spanish sentence on what it lets the user do. No marketing claims.
- status: shipped when it is in the published version or an older one; next_release when it is in a version newer than the published one or in an "Unreleased" section; planned for roadmap or "coming soon" items; retired when the text says it was removed or replaced.
- If you are not told the published version, treat the newest released version as published.
- sinceVersion: the version that introduced it, or "" when unknown.
- updates: when an item is the same feature as one of the existing features (same capability, even if renamed or changed status), its existing name exactly as given; otherwise "". Do not repeat existing features that the text does not change.
- releases: one item per version in the text, newest first. date as YYYY-MM-DD or "" when unknown. notes: a short Spanish summary of what changed for users.
- notes: up to 3 short Spanish remarks for the owner (for example, an item whose status you could not tell).`;

export type ChangelogContext = {
  appTitle: string;
  publishedVersion: string | null;
  existing: { name: string; status: FeatureStatus; sinceVersion: string | null }[];
};

export function buildChangelogPrompt(text: string, context: ChangelogContext): string {
  return [
    `App: ${context.appTitle}. Version published in the store: ${context.publishedVersion ?? "unknown"}.`,
    "",
    "Existing features:",
    ...(context.existing.length
      ? context.existing.map((f) => `- ${f.name} | ${f.status}${f.sinceVersion ? ` | since ${f.sinceVersion}` : ""}`)
      : ["(none)"]),
    "",
    "CHANGELOG:",
    text.slice(0, MAX_CHANGELOG_CHARS),
  ].join("\n");
}

export type ProposedFeature = FeatureInput & {
  /** Existing feature it would update, or null for a new one. */
  existingId: number | null;
};
export type ChangelogProposal = { features: ProposedFeature[]; releases: ReleaseInput[]; notes: string[] };

const foldName = (s: string) => fold(s).replace(/\s+/g, " ").trim();

/** Validates the model's items, matches them to existing features and drops repeats and no-op updates. */
export function cleanChangelogProposal(
  output: ChangelogOutput,
  existing: { id: number; name: string; summary: string; status: FeatureStatus; sinceVersion: string | null }[],
): ChangelogProposal {
  const byName = new Map(existing.map((f) => [foldName(f.name), f]));
  const seen = new Set<string>();
  const features: ProposedFeature[] = [];
  for (const item of output.features) {
    const parsed = featureInputSchema.safeParse({ ...item, name: item.name.slice(0, 120), summary: item.summary.slice(0, 300), advertise: true });
    if (!parsed.success) continue;
    const match = byName.get(foldName(item.updates)) ?? byName.get(foldName(parsed.data.name)) ?? null;
    const key = match ? `#${match.id}` : foldName(parsed.data.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const f = parsed.data;
    // Nothing would change: not worth a checkbox.
    if (match && match.status === f.status && foldName(match.summary) === foldName(f.summary || match.summary) && (f.sinceVersion ?? match.sinceVersion) === match.sinceVersion) {
      continue;
    }
    // An update keeps the owner's name and, when the model gives none, their summary.
    features.push({
      ...f,
      name: match?.name ?? f.name,
      summary: f.summary || match?.summary || "",
      sinceVersion: f.sinceVersion ?? match?.sinceVersion ?? null,
      existingId: match?.id ?? null,
    });
  }
  const versions = new Set<string>();
  const releases: ReleaseInput[] = [];
  for (const r of output.releases) {
    const parsed = releaseInputSchema.safeParse({ ...r, notes: r.notes.slice(0, 4000) });
    if (!parsed.success || versions.has(parsed.data.version)) continue;
    versions.add(parsed.data.version);
    releases.push(parsed.data);
  }
  return { features, releases, notes: output.notes.map((n) => n.trim()).filter(Boolean).slice(0, 3) };
}
