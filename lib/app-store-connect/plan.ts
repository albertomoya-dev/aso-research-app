import { getListingDraft, type ListingDraftRow } from "../listing-draft-queries";
import type { DraftTarget } from "../listing-drafts";
import { ascConfig } from "./auth";
import { ascAlternatives, type AscLocale, toAscLocale } from "./locales";

/** What can be done with a draft in App Store Connect, before talking to Apple. Same answer for the page and the action. */
export type AscPublishPlan =
  | { kind: "unconfigured"; error: string | null }
  | { kind: "wrong-store" }
  | { kind: "no-locale"; alternatives: string[] }
  | { kind: "no-draft"; locale: AscLocale }
  | { kind: "ready"; locale: AscLocale; draft: ListingDraftRow; writeEnabled: boolean };

export async function planAscPublish(app: { id: number; store: string }, target: DraftTarget): Promise<AscPublishPlan> {
  const config = ascConfig();
  if (!config.configured) return { kind: "unconfigured", error: config.error };
  if (app.store !== "ios") return { kind: "wrong-store" };
  const locale = toAscLocale(target.locale);
  if (!locale) return { kind: "no-locale", alternatives: ascAlternatives(target.locale) };
  const draft = await getListingDraft(app.id, target.locale, "");
  if (!draft) return { kind: "no-draft", locale };
  return { kind: "ready", locale, draft, writeEnabled: config.writeEnabled };
}
