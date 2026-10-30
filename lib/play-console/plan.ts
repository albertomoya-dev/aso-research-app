import { getListingDraft, type ListingDraftRow } from "../listing-draft-queries";
import type { DraftTarget } from "../listing-drafts";
import { playFieldsFromDraft } from "../publications";
import { playConfig } from "./auth";
import { playAlternatives, type PlayLanguage, toPlayLanguage } from "./locales";

/** What can be done with a draft in Google Play: the reasons it cannot be published, or what would go. */
export type PlayPublishPlan =
  | { kind: "unconfigured"; error: string | null }
  | { kind: "wrong-store" }
  /** Custom store listings (one per country) are not in the Android Publisher API. */
  | { kind: "custom-listing" }
  | { kind: "no-language"; alternatives: string[] }
  | { kind: "no-draft"; language: PlayLanguage }
  | {
      kind: "ready";
      language: PlayLanguage;
      draft: ListingDraftRow;
      fields: ReturnType<typeof playFieldsFromDraft>;
      writeEnabled: boolean;
    };

/** Checks configuration, store, listing type, Play language and saved draft, in that order. Same answer for the page and the action. */
export async function planPlayPublish(app: { id: number; store: string }, target: DraftTarget): Promise<PlayPublishPlan> {
  const config = playConfig();
  if (!config.configured) return { kind: "unconfigured", error: config.error };
  if (app.store !== "android") return { kind: "wrong-store" };
  if (target.country) return { kind: "custom-listing" };
  const language = toPlayLanguage(target.locale);
  if (!language) return { kind: "no-language", alternatives: playAlternatives(target.locale) };
  const draft = await getListingDraft(app.id, target.locale, "");
  if (!draft) return { kind: "no-draft", language };
  return { kind: "ready", language, draft, fields: playFieldsFromDraft(draft.draft), writeEnabled: config.writeEnabled };
}
