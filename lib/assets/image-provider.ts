/**
 * Raster image generation for logos. Claude does not draw, so this talks to one of two
 * providers through their REST APIs: OpenAI Images (gpt-image-2.5-flare, or gpt-image-2.5-sunburst for higher quality) or Google Gemini
 * (gemini-2.5-flash-image, or an Imagen model). Picked by IMAGE_PROVIDER, or by which key exists.
 */

export type ImageProvider = "openai" | "gemini";

export type GeneratedImage = { mime: string; base64: string };

export class ImageGenError extends Error {}

const DEFAULT_MODEL: Record<ImageProvider, string> = { openai: "gpt-image-2.5-flare", gemini: "gemini-2.5-flash-image" };

export function imageProvider(env: Record<string, string | undefined> = process.env): ImageProvider | null {
  const wanted = env.IMAGE_PROVIDER?.trim().toLowerCase();
  if (wanted === "openai" || wanted === "gemini") return wanted;
  if (env.OPENAI_API_KEY) return "openai";
  if (env.GEMINI_API_KEY) return "gemini";
  return null;
}

export function imageModel(provider: ImageProvider): string {
  return (provider === "openai" ? process.env.OPENAI_IMAGE_MODEL : process.env.GEMINI_IMAGE_MODEL)?.trim() || DEFAULT_MODEL[provider];
}

export const IMAGE_PROVIDER_LABEL: Record<ImageProvider, string> = { openai: "OpenAI", gemini: "Google Gemini" };

export type ImageAspect = "1:1" | "9:16";
export type GenerateInput = { prompt: string; count: number; aspect?: ImageAspect; signal?: AbortSignal };

/** Square (1024×1024) or portrait (1024×1536 / 9:16) images as base64. Throws ImageGenError with a message for the user. */
export async function generateImages(input: GenerateInput): Promise<{ images: GeneratedImage[]; provider: ImageProvider; model: string }> {
  const provider = imageProvider();
  if (!provider) throw new ImageGenError("No hay proveedor de imágenes: añade OPENAI_API_KEY o GEMINI_API_KEY.");
  const model = imageModel(provider);
  const count = Math.max(1, Math.min(4, input.count));
  const aspect = input.aspect ?? "1:1";
  const images = provider === "openai" ? await openai(model, input.prompt, count, aspect, input.signal) : await gemini(model, input.prompt, count, aspect, input.signal);
  if (images.length === 0) throw new ImageGenError("El proveedor no devolvió ninguna imagen.");
  return { images, provider, model };
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { error?: { message?: string } | string };
    const msg = typeof json.error === "string" ? json.error : json.error?.message;
    if (msg) return msg.slice(0, 300);
  } catch {}
  return text.slice(0, 300) || `HTTP ${res.status}`;
}

function failure(provider: ImageProvider, status: number, detail: string): ImageGenError {
  const name = IMAGE_PROVIDER_LABEL[provider];
  if (status === 401 || status === 403) return new ImageGenError(`La clave de ${name} no es válida o no tiene permiso para generar imágenes.`);
  if (status === 429) return new ImageGenError(`${name} ha limitado las peticiones. Inténtalo en un minuto.`);
  if (status === 400 && /safety|policy|moderation|blocked/i.test(detail)) return new ImageGenError(`${name} rechazó el prompt por sus normas de contenido. Cambia la descripción.`);
  return new ImageGenError(`${name} respondió ${status}: ${detail}`);
}

async function openai(model: string, prompt: string, n: number, aspect: ImageAspect, signal?: AbortSignal): Promise<GeneratedImage[]> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      prompt,
      n,
      size: aspect === "9:16" ? "1024x1536" : "1024x1024",
      quality: process.env.OPENAI_IMAGE_QUALITY?.trim() || "medium",
      // WebP keeps the saved rows small; the browser converts to PNG when downloading.
      output_format: "webp",
      output_compression: 92,
    }),
  });
  if (!res.ok) throw failure("openai", res.status, await readError(res));
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  return (json.data ?? []).flatMap((d) => (d.b64_json ? [{ mime: "image/webp", base64: d.b64_json }] : []));
}

async function gemini(model: string, prompt: string, n: number, aspect: ImageAspect, signal?: AbortSignal): Promise<GeneratedImage[]> {
  const key = process.env.GEMINI_API_KEY ?? "";
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
  const headers = { "content-type": "application/json", "x-goog-api-key": key };

  if (model.startsWith("imagen-")) {
    const res = await fetch(`${base}:predict`, {
      method: "POST",
      signal,
      headers,
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: n, aspectRatio: aspect } }),
    });
    if (!res.ok) throw failure("gemini", res.status, await readError(res));
    const json = (await res.json()) as { predictions?: { bytesBase64Encoded?: string; mimeType?: string }[] };
    return (json.predictions ?? []).flatMap((p) => (p.bytesBase64Encoded ? [{ mime: p.mimeType ?? "image/png", base64: p.bytesBase64Encoded }] : []));
  }

  // Gemini image models return one image per call.
  const calls = Array.from({ length: n }, () =>
    fetch(`${base}:generateContent`, {
      method: "POST",
      signal,
      headers,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect } },
      }),
    }),
  );
  const images: GeneratedImage[] = [];
  let lastError: ImageGenError | null = null;
  for (const res of await Promise.all(calls)) {
    if (!res.ok) {
      lastError = failure("gemini", res.status, await readError(res));
      continue;
    }
    const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[] };
    for (const part of json.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData) images.push({ mime: part.inlineData.mimeType, base64: part.inlineData.data });
    }
  }
  if (images.length === 0 && lastError) throw lastError;
  return images;
}
