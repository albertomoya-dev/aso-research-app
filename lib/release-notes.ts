import { z } from "zod";
import { compareVersions } from "./health";
import { charCount, type Issue, type MetadataDraft } from "./metadata-check";
import { POLICY_RULES, policyCheck } from "./policy-check";
import type { Store } from "./stores/types";

// «Novedades de esta versión» (F11): release notes written from the product sheet (next_release
// features), the latest declared release and a pasted CHANGELOG, in the brand's tone and per locale.

/** Bump when the instructions or the output shape change. */
export const RELEASE_NOTES_PROMPT_VERSION = "rn-1";

/**
 * Store limits for the release notes. Google Play: 500 characters per language ("What's new in this
 * release"); App Store: 4000 ("What's New in This Version").
 */
export const RELEASE_NOTES_LIMITS: Record<Store, number> = { android: 500, ios: 4000 };
export const MAX_PASTED_CHANGELOG = 10_000;
/** Keywords suggested to the model, to use only where they fit naturally. */
export const MAX_NOTE_KEYWORDS = 10;

/** Loose on purpose; `cleanReleaseNotes` tidies it after. */
export const releaseNotesOutputSchema = z.object({
  text: z.string(),
  keywordsUsed: z.array(z.string()),
  notes: z.array(z.string()),
});
export type ReleaseNotesOutput = z.infer<typeof releaseNotesOutputSchema>;

export const RELEASE_NOTES_SYSTEM_PROMPT = `You write the release notes ("What's new in this version") of a mobile app for its store listing.

Rules:
- Write in the requested locale, natural and correct for people in that country. Use the brand tone from PRODUCT FACTS when given.
- Lead with benefits for the user, not technical details: what they can do now that they could not before. Then fixes and improvements in one short line if relevant.
- Only mention what the input says changed in this version: the features of the next version, the latest release notes and the pasted CHANGELOG. Never invent features, never announce planned ones, never mention internal changes (refactors, dependencies, CI).
- Use the suggested keywords only where they fit naturally; never stuff them. Release notes are not indexed for search, but they are read by people deciding to update or install.
- Plain text for the store: short lines or bullet lines starting with "• ". No markdown (no #, no **), no links, no emojis at the start of every line.
- Store policies: no price, promotion or ranking words (free, best, #1, top, sale, discount and their translations), no other apps' or companies' names, no testimonials. Health apps: never claim to diagnose, cure, treat or prevent a disease.
- Respect the character limit strictly (count characters, including spaces and line breaks). Google Play allows 500 characters; the App Store 4000, but a short, scannable text works better there too (aim for under 1000).

Also return:
- keywordsUsed: the suggested keywords you used.
- notes: up to 3 short Spanish tips for the user (for example, something from the CHANGELOG you left out and why).`;

export type ReleaseNotesInput = {
  store: Store;
  locale: string;
  brand: string;
  version?: string | null;
  /** next_release features the owner advertises. */
  features: { name: string; summary: string }[];
  /** Notes of the latest declared release (product_releases), if any. */
  latestRelease?: { version: string; notes: string } | null;
  changelog?: string | null;
  /** PRODUCT FACTS block (tone, constraints), or null. */
  facts: string | null;
  keywords: string[];
};

export function buildReleaseNotesPrompt(input: ReleaseNotesInput, feedback?: string[]): string {
  const limit = RELEASE_NOTES_LIMITS[input.store];
  const changelog = input.changelog?.trim().slice(0, MAX_PASTED_CHANGELOG);
  const features = input.features.filter((f) => f.name.trim());
  return [
    `Store: ${input.store === "ios" ? "Apple App Store" : "Google Play"}. Write the release notes in locale: ${input.locale}. Limit: ${limit} characters.`,
    `App: ${input.brand || "(no brand)"}${input.version ? `, version ${input.version}` : ""}.`,
    "",
    input.facts,
    input.facts ? "" : null,
    "What is new in this version (features of the next release, declared by the owner):",
    ...(features.length ? features.map((f) => `- ${f.name.trim()}${f.summary.trim() ? `: ${f.summary.trim()}` : ""}`) : ["(none declared)"]),
    input.latestRelease?.notes.trim() ? `\nLatest declared release (${input.latestRelease.version}):\n${input.latestRelease.notes.trim()}` : null,
    changelog ? `\nCHANGELOG pasted by the user (only the part for this version matters):\n${changelog}` : null,
    "",
    `Suggested keywords (use only where natural): ${input.keywords.length ? input.keywords.slice(0, MAX_NOTE_KEYWORDS).join(", ") : "(none)"}`,
    feedback?.length ? `\nYour previous answer broke these rules, fix them:\n${feedback.map((f) => `- ${f}`).join("\n")}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * The declared release the notes are for: the one the user typed, else the newest one after the
 * version in the store (or, when that is unknown, the newest one without a date). Never the version
 * already published: its notes are old news.
 */
export function upcomingRelease<T extends { version: string; date: string | null }>(
  releases: T[],
  publishedVersion: string | null | undefined,
  wanted?: string | null,
): T | null {
  const published = publishedVersion?.trim() || null;
  const notPublished = releases.filter((r) => !published || compareVersions(r.version, published) !== 0);
  const typed = wanted?.trim() ? notPublished.find((r) => r.version.trim() === wanted.trim()) : undefined;
  if (typed) return typed;
  const candidates = notPublished.filter((r) => (published ? compareVersions(r.version, published) > 0 : !r.date));
  return candidates.sort((a, b) => compareVersions(b.version, a.version))[0] ?? null;
}

/** True when there is something to write about: features, the latest release notes or a pasted CHANGELOG. */
export const hasReleaseMaterial = (input: Pick<ReleaseNotesInput, "features" | "latestRelease" | "changelog">) =>
  input.features.some((f) => f.name.trim()) || Boolean(input.latestRelease?.notes.trim()) || Boolean(input.changelog?.trim());

/** Store text: no markdown headings or bold, "•" bullets, single blank lines at most, trimmed. */
export function tidyReleaseNotes(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s+/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/^\s*[-*]\s+/, "• ")
        .replace(/[ \t]+$/, ""),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Cuts the text to the limit at the last whole line (or sentence, or word) that fits. */
export function fitToLimit(text: string, limit: number): string {
  if (charCount(text) <= limit) return text;
  const head = [...text].slice(0, limit).join("");
  const cuts = [head.lastIndexOf("\n"), Math.max(head.lastIndexOf(". "), head.lastIndexOf("! ")) + 1, head.lastIndexOf(" ")];
  const cut = cuts.find((i) => i > limit * 0.5);
  return (cut ? head.slice(0, cut) : head).trim();
}

export type ReleaseNotes = {
  text: string;
  length: number;
  limit: number;
  /** The model went over the limit and the text was cut at a whole line or sentence. */
  trimmed: boolean;
  keywordsUsed: string[];
  notes: string[];
  issues: Issue[];
};

// Policy-check-lite: the description rules that make sense for release notes.
const NOTE_RULES = POLICY_RULES.filter((r) =>
  ["play.description.promo", "play.description.testimonial", "other-apps", "health.claims", "ios.description.price"].includes(r.id),
);

/**
 * Promo terms, other brands, testimonials, health claims and prices, plus the length. The text is
 * checked as if it were a Google Play description, so the promo terms apply to both stores; the
 * prices rule is the App Store's.
 */
export function releaseNotesIssues(
  store: Store,
  text: string,
  ctx: { lang?: string; category?: string | null; brands?: string[] } = {},
): Issue[] {
  const draft: MetadataDraft = { title: "", subtitle: "", keywordField: "", shortDescription: "", description: text };
  const rename = (i: Issue) => ({ ...i, text: i.text.replace(/^Descripción:/, "Notas:") });
  const issues = [
    ...policyCheck("android", draft, ctx, NOTE_RULES.filter((r) => r.store !== "ios")),
    ...policyCheck("ios", draft, ctx, NOTE_RULES.filter((r) => r.store === "ios")),
  ].map(rename);
  const limit = RELEASE_NOTES_LIMITS[store];
  const length = charCount(text);
  if (length > limit) issues.unshift({ level: "error", text: `Notas: ${length} de ${limit} caracteres, sobran ${length - limit}.` });
  return issues;
}

export function cleanReleaseNotes(
  store: Store,
  output: ReleaseNotesOutput,
  ctx: { lang?: string; category?: string | null; brands?: string[] } = {},
): ReleaseNotes {
  const limit = RELEASE_NOTES_LIMITS[store];
  const tidy = tidyReleaseNotes(output.text);
  const text = fitToLimit(tidy, limit);
  return {
    text,
    length: charCount(text),
    limit,
    trimmed: text !== tidy,
    keywordsUsed: [...new Set(output.keywordsUsed.map((k) => k.trim()).filter(Boolean))],
    notes: output.notes.map((n) => n.trim()).filter(Boolean).slice(0, 3),
    issues: releaseNotesIssues(store, text, ctx),
  };
}
