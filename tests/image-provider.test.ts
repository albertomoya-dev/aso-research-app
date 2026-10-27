import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanLogoPrompts } from "@/lib/assets/creative-ai";
import { generateImages, ImageGenError, imageModel, imageProvider } from "@/lib/assets/image-provider";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  vi.restoreAllMocks();
});

function mockFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const { status, body } = handler(String(input), init ?? {});
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return spy;
}

describe("imageProvider", () => {
  it("is null without keys and picks by key or by IMAGE_PROVIDER", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.IMAGE_PROVIDER;
    expect(imageProvider()).toBeNull();
    process.env.GEMINI_API_KEY = "g";
    expect(imageProvider()).toBe("gemini");
    process.env.OPENAI_API_KEY = "o";
    expect(imageProvider()).toBe("openai");
    process.env.IMAGE_PROVIDER = "gemini";
    expect(imageProvider()).toBe("gemini");
    expect(imageModel("gemini")).toBe("gemini-2.5-flash-image");
    process.env.GEMINI_IMAGE_MODEL = "imagen-4.0-generate-001";
    expect(imageModel("gemini")).toBe("imagen-4.0-generate-001");
  });
});

describe("generateImages", () => {
  it("calls OpenAI once with n images and returns webp", async () => {
    process.env.IMAGE_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    const spy = mockFetch(() => ({ status: 200, body: { data: [{ b64_json: "AAA" }, { b64_json: "BBB" }] } }));
    const result = await generateImages({ prompt: "an icon", count: 2 });
    expect(result.images).toEqual([
      { mime: "image/webp", base64: "AAA" },
      { mime: "image/webp", base64: "BBB" },
    ]);
    expect(result.model).toBe("gpt-image-1");
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ n: 2, size: "1024x1024", output_format: "webp" });
    expect(spy.mock.calls[0][1]?.headers).toMatchObject({ authorization: "Bearer sk-test" });
  });

  it("asks for a portrait size when the aspect is 9:16", async () => {
    process.env.IMAGE_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    const spy = mockFetch(() => ({ status: 200, body: { data: [{ b64_json: "AAA" }] } }));
    await generateImages({ prompt: "a backdrop", count: 1, aspect: "9:16" });
    expect(JSON.parse(String(spy.mock.calls[0][1]?.body))).toMatchObject({ n: 1, size: "1024x1536" });

    process.env.IMAGE_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "g";
    const gem = mockFetch(() => ({ status: 200, body: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "P" } }] } }] } }));
    await generateImages({ prompt: "a backdrop", count: 1, aspect: "9:16" });
    expect(JSON.parse(String(gem.mock.calls.at(-1)?.[1]?.body)).generationConfig.imageConfig).toEqual({ aspectRatio: "9:16" });
  });

  it("calls Gemini once per image and reads inlineData", async () => {
    process.env.IMAGE_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "g";
    const spy = mockFetch(() => ({
      status: 200,
      body: { candidates: [{ content: { parts: [{ text: "here" }, { inlineData: { mimeType: "image/png", data: "PNG" } }] } }] },
    }));
    const result = await generateImages({ prompt: "an icon", count: 3 });
    expect(result.images).toHaveLength(3);
    expect(result.images[0]).toEqual({ mime: "image/png", base64: "PNG" });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(String(spy.mock.calls[0][0])).toContain("gemini-2.5-flash-image:generateContent");
  });

  it("uses predict for Imagen models", async () => {
    process.env.IMAGE_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "g";
    process.env.GEMINI_IMAGE_MODEL = "imagen-4.0-generate-001";
    const spy = mockFetch(() => ({ status: 200, body: { predictions: [{ bytesBase64Encoded: "X", mimeType: "image/png" }] } }));
    const result = await generateImages({ prompt: "an icon", count: 2 });
    expect(result.images).toEqual([{ mime: "image/png", base64: "X" }]);
    expect(String(spy.mock.calls[0][0])).toContain(":predict");
    expect(JSON.parse(String(spy.mock.calls[0][1]?.body)).parameters.sampleCount).toBe(2);
  });

  it("turns provider errors into user messages", async () => {
    process.env.IMAGE_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk";
    mockFetch(() => ({ status: 401, body: { error: { message: "bad key" } } }));
    await expect(generateImages({ prompt: "x", count: 1 })).rejects.toThrow(ImageGenError);
    await expect(generateImages({ prompt: "x", count: 1 })).rejects.toThrow(/clave de OpenAI/);
    mockFetch(() => ({ status: 400, body: { error: { message: "Your request was rejected by the safety system" } } }));
    await expect(generateImages({ prompt: "x", count: 1 })).rejects.toThrow(/normas de contenido/);
  });

  it("fails clearly without a provider", async () => {
    delete process.env.IMAGE_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    await expect(generateImages({ prompt: "x", count: 1 })).rejects.toThrow(/OPENAI_API_KEY o GEMINI_API_KEY/);
  });
});

describe("cleanLogoPrompts", () => {
  it("collapses whitespace, drops empty prompts and caps at four", () => {
    const prompts = cleanLogoPrompts({
      prompts: [
        { name: " Rayo ", prompt: "a  bold\n\nicon of a lightning bolt, flat vector", rationale: "r" },
        { name: "Vacío", prompt: "short", rationale: "r" },
        ...Array.from({ length: 5 }, (_, i) => ({ name: `p${i}`, prompt: `prompt number ${i} with enough words here`, rationale: "" })),
      ],
    });
    expect(prompts).toHaveLength(4);
    expect(prompts[0]).toEqual({ name: "Rayo", prompt: "a bold icon of a lightning bolt, flat vector", rationale: "r" });
  });
});
