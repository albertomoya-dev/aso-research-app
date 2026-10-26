import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
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

/** Asks Claude for keyword ideas. Returns the raw model output plus the model that actually answered. */
export async function suggestKeywords(input: PromptInput): Promise<{ output: ModelOutput; model: string }> {
  if (!hasAnthropicKey()) throw new AiError("Falta ANTHROPIC_API_KEY en las variables de entorno.");
  try {
    const response = await getClient().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      // If the model declines, the API retries on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(modelOutputSchema) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });
    if (response.stop_reason === "refusal") throw new AiError("El modelo no quiso responder a esta petición.");
    if (response.stop_reason === "max_tokens") throw new AiError("La respuesta se cortó. Prueba con un enfoque más concreto.");
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
