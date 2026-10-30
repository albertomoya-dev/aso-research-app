import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { buildListingPrompt, LISTING_SYSTEM_PROMPT, type ListingOutput, listingOutputSchema, type ListingPromptInput } from "./listing-optimizer";
import {
  buildIconConceptsPrompt,
  buildScreenshotCopyPrompt,
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
import {
  buildChangelogPrompt,
  CHANGELOG_SYSTEM_PROMPT,
  type ChangelogContext,
  type ChangelogOutput,
  changelogOutputSchema,
} from "./product-facts";
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

/** One structured-output request. Returns the parsed output and the model that actually answered. */
async function askClaude<T extends z.ZodType>(schema: T, system: string, prompt: string): Promise<{ output: z.infer<T>; model: string }> {
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

/** Asks Claude for screenshot captions built around the tracked keywords. */
export function writeScreenshotCopy(
  input: CreativeInput & { count: number; current: { headline: string; subheadline: string }[] },
): Promise<{ output: ScreenshotCopy; model: string }> {
  return askClaude(screenshotCopySchema, SCREENSHOT_COPY_SYSTEM_PROMPT, buildScreenshotCopyPrompt(input));
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
