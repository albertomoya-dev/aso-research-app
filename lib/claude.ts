import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { buildListingPrompt, LISTING_SYSTEM_PROMPT, type ListingOutput, listingOutputSchema, type ListingPromptInput } from "./listing-optimizer";
import {
  buildIconConceptsPrompt,
  buildScreenshotCopyContent,
  type CreativeInput,
  buildLogoPromptsPrompt,
  ICON_CONCEPTS_SYSTEM_PROMPT,
  BACKGROUND_PROMPTS_SYSTEM_PROMPT,
  buildBackgroundPromptsPrompt,
  type BackgroundThemeHint,
  LOGO_PROMPTS_SYSTEM_PROMPT,
  type LogoPrompts,
  logoPromptsSchema,
  type IconConcepts,
  iconConceptsSchema,
  SCREENSHOT_COPY_SYSTEM_PROMPT,
  type ScreenshotCopy,
  screenshotCopySchema,
} from "./assets/creative-ai";
import { buildLocalizePrompt, LOCALIZE_SYSTEM_PROMPT, type LocalizePromptInput } from "./localize";
import {
  buildReleaseNotesPrompt,
  RELEASE_NOTES_SYSTEM_PROMPT,
  type ReleaseNotesInput,
  type ReleaseNotesOutput,
  releaseNotesOutputSchema,
} from "./release-notes";
import {
  buildChangelogPrompt,
  CHANGELOG_SYSTEM_PROMPT,
  type ChangelogContext,
  type ChangelogOutput,
  changelogOutputSchema,
} from "./product-facts";
import {
  buildRelevancePrompt,
  type RelevanceContext,
  type RelevanceItem,
  type RelevanceOutput,
  relevanceOutputSchema,
  RELEVANCE_SYSTEM_PROMPT,
} from "./relevance";
import {
  buildReviewReplyPrompt,
  REVIEW_REPLY_SYSTEM_PROMPT,
  type ReviewReplyInput,
  type ReviewReplyOutput,
  reviewReplyOutputSchema,
} from "./review-replies";
import { buildReviewPrompt, REVIEW_SYSTEM_PROMPT, reviewAnalysisSchema, type ReviewAnalysis, type ReviewPromptInput } from "./review-analysis";
import { buildUserPrompt, modelOutputSchema, type ModelOutput, type PromptInput, SYSTEM_PROMPT } from "./suggestions";

export const AI_MODEL = "claude-opus-5-5";

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class AiError extends Error {}

let client: Anthropic | null = null;
function getClient() {
  // The SDK retries 429, 5xx and connection errors with backoff.
  client ??= new Anthropic({ timeout: 100_000, maxRetries: 2 });
  return client;
}

/** One structured-output request; `prompt` is text, or text and images (vision). Returns the parsed output and the model that actually answered. */
async function askClaude<T extends z.ZodType>(
  schema: T,
  system: string,
  prompt: string | BetaContentBlockParam[],
): Promise<{ output: z.infer<T>; model: string }> {
  if (!hasAnthropicKey()) throw new AiError("Falta ANTHROPIC_API_KEY en las variables de entorno.");
  try {
    const response = await getClient().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      // If the model declines, the API retries on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") throw new AiError("El modelo no quiso responder a esta petición.");
    if (response.stop_reason === "max_tokens") throw new AiError("La respuesta se cortó. Prueba con menos datos.");
    if (!response.parsed_output) throw new AiError("La respuesta no tenía el formato esperado.");
    return { output: response.parsed_output, model: response.model };
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new AiError("La clave de Anthropic no es válida.");
    if (err instanceof Anthropic.RateLimitError) throw new AiError("Límite de uso de la API alcanzado. Inténtalo en un minuto.");
    if (err instanceof Anthropic.APIConnectionTimeoutError) throw new AiError("Claude tardó demasiado en responder. Inténtalo de nuevo.");
    if (err instanceof Anthropic.APIError) throw new AiError(`Error de la API de Claude (${err.status ?? "sin estado"}).`);
    throw err;
  }
}

/** Asks Claude for keyword ideas. */
export function suggestKeywords(input: PromptInput): Promise<{ output: ModelOutput; model: string }> {
  return askClaude(modelOutputSchema, SYSTEM_PROMPT, buildUserPrompt(input));
}

/** Asks Claude what the reviews say and what that means for the listing. */
export function analyzeReviews(input: ReviewPromptInput): Promise<{ output: ReviewAnalysis; model: string }> {
  return askClaude(reviewAnalysisSchema, REVIEW_SYSTEM_PROMPT, buildReviewPrompt(input));
}

/** Asks Claude to rewrite the listing around the tracked keywords. `feedback` lists rules the previous try broke. */
export function rewriteListing(input: ListingPromptInput, feedback?: string[]): Promise<{ output: ListingOutput; model: string }> {
  return askClaude(listingOutputSchema, LISTING_SYSTEM_PROMPT, buildListingPrompt(input, feedback));
}

/** Asks Claude for screenshot captions built around the relevant keywords. `images` (data URLs, one per slide or null) lets it see each screen. */
export function writeScreenshotCopy(
  input: CreativeInput & { count: number; current: { headline: string; subheadline: string }[] },
  images: (string | null)[] = [],
): Promise<{ output: ScreenshotCopy; model: string }> {
  return askClaude(screenshotCopySchema, SCREENSHOT_COPY_SYSTEM_PROMPT, buildScreenshotCopyContent(input, images));
}

/** Asks Claude for four icon concepts in the vector icon system. */
export function designIconConcepts(input: CreativeInput): Promise<{ output: IconConcepts; model: string }> {
  return askClaude(iconConceptsSchema, ICON_CONCEPTS_SYSTEM_PROMPT, buildIconConceptsPrompt(input));
}

/** Asks Claude to write prompts for the image generator (logos). */
export function writeLogoPrompts(input: CreativeInput): Promise<{ output: LogoPrompts; model: string }> {
  return askClaude(logoPromptsSchema, LOGO_PROMPTS_SYSTEM_PROMPT, buildLogoPromptsPrompt(input));
}

export function writeBackgroundPrompts(input: CreativeInput, theme?: BackgroundThemeHint): Promise<{ output: LogoPrompts; model: string }> {
  return askClaude(logoPromptsSchema, BACKGROUND_PROMPTS_SYSTEM_PROMPT, buildBackgroundPromptsPrompt(input, theme));
}

/** Asks Claude to turn a CHANGELOG into features with their status. Only a proposal: the owner confirms what gets saved. */
export function importChangelog(text: string, current: ChangelogContext): Promise<{ output: ChangelogOutput; model: string }> {
  return askClaude(changelogOutputSchema, CHANGELOG_SYSTEM_PROMPT, buildChangelogPrompt(text, current));
}

/** Asks Claude to rate 1–5 how relevant each keyword is for the app, and whether searchers want another kind of app. One batch (up to 100). */
export function rateRelevance(context: RelevanceContext, items: RelevanceItem[]): Promise<{ output: RelevanceOutput; model: string }> {
  return askClaude(relevanceOutputSchema, RELEVANCE_SYSTEM_PROMPT, buildRelevancePrompt(context, items));
}

/** Asks Claude to write the listing for another locale from that market's searches (not a literal translation). Only a proposal. */
export function localizeListing(input: LocalizePromptInput, feedback?: string[]): Promise<{ output: ListingOutput; model: string }> {
  return askClaude(listingOutputSchema, LOCALIZE_SYSTEM_PROMPT, buildLocalizePrompt(input, feedback));
}

/** Asks Claude for the release notes of the next version in one locale. */
export function writeReleaseNotes(input: ReleaseNotesInput, feedback?: string[]): Promise<{ output: ReleaseNotesOutput; model: string }> {
  return askClaude(releaseNotesOutputSchema, RELEASE_NOTES_SYSTEM_PROMPT, buildReleaseNotesPrompt(input, feedback));
}

/** Asks Claude for a public reply to one of the app's own Google Play reviews. Only a draft: the owner edits and confirms it. */
export function draftReviewReply(input: ReviewReplyInput): Promise<{ output: ReviewReplyOutput; model: string }> {
  return askClaude(reviewReplyOutputSchema, REVIEW_REPLY_SYSTEM_PROMPT, buildReviewReplyPrompt(input));
}
