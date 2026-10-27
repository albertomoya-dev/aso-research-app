import { z } from "zod";
import type { AppMeta, Store } from "@/lib/stores/types";
import { type IconSpec, iconSpecSchema, SYMBOL_NAMES } from "./icon";
import { HEADLINE_SOFT_LIMIT, SUBHEADLINE_SOFT_LIMIT, stripMarks } from "./screenshots";

/** Bump when the instructions or the output shape change. */
export const CREATIVE_PROMPT_VERSION = "crt-1";

export type CreativeKeyword = { term: string; position: number | null; popularity: number | null; opportunity: number | null };

export type CreativeInput = {
  store: Store;
  countryName: string;
  lang: string;
  meta: AppMeta;
  keywords: CreativeKeyword[];
  focus?: string;
};

const num = (n: number | null) => (n == null ? "–" : String(n));

function describeApp(input: CreativeInput): string {
  const m = input.meta;
  const keywords = [...input.keywords]
    .sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1) || (b.popularity ?? -1) - (a.popularity ?? -1))
    .slice(0, 40)
    .map((k) => `- ${k.term} (posición ${num(k.position)}, popularidad ${num(k.popularity)}, oportunidad ${num(k.opportunity)})`)
    .join("\n");
  return [
    `Store: ${input.store === "ios" ? "Apple App Store" : "Google Play"} · Country: ${input.countryName} · Language of the listing: ${input.lang}`,
    `App: ${m.title}`,
    `Developer: ${m.developer}`,
    `Category: ${m.category ?? "unknown"}`,
    m.shortDescription ? `Short description: ${m.shortDescription}` : "",
    `Description:\n${m.description.slice(0, 2500)}`,
    `Tracked keywords (best first):\n${keywords || "- none yet"}`,
    input.focus ? `Extra guidance from the user: ${input.focus}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---------- Screenshot captions ----------

export const screenshotCopySchema = z.object({
  slides: z.array(
    z.object({
      headline: z.string(),
      subheadline: z.string(),
      /** The tracked keyword the slide targets, or an empty string. */
      keyword: z.string(),
    }),
  ),
  /** Short Spanish notes about the choices made. */
  notes: z.array(z.string()),
});
export type ScreenshotCopy = z.infer<typeof screenshotCopySchema>;

export const SCREENSHOT_COPY_SYSTEM_PROMPT = `You write the captions for app store screenshots (App Store and Google Play). People decide in two seconds whether to install, so each screenshot shows one benefit in a few big words.

Rules:
- Write in the language of the listing, natural and idiomatic for that country.
- headline: 2 to 5 words, at most ${HEADLINE_SOFT_LIMIT} characters. Benefit first, not feature names. No final period. Wrap the single most important phrase in *asterisks* so it can be highlighted, for example "Entrena *sin excusas*". Exactly one highlighted phrase per headline, or none.
- subheadline: one short sentence, at most ${SUBHEADLINE_SOFT_LIMIT} characters, that makes the headline concrete. May be empty on the first slide.
- Work the tracked keywords in naturally: the first slide carries the app's core promise with the best keyword; later slides each take one keyword or one key feature from the description. Never stuff several keywords in one caption, never invent features the description does not mention.
- Do not use brand names of other apps. Do not use the word "app" unless unavoidable. Avoid "best", "#1" and other claims the stores reject.
- Return exactly the number of slides requested, in the order they should appear: promise, then the strongest features, then social proof or a closing nudge if the description supports it.
- keyword: the tracked keyword the slide is built around, exactly as given, or "" when the slide is about a feature with no tracked keyword.
- notes: up to 3 short Spanish sentences on your choices (for example which keyword you left out and why).`;

export function buildScreenshotCopyPrompt(input: CreativeInput & { count: number; current: { headline: string; subheadline: string }[] }): string {
  const current = input.current
    .map((s, i) => `${i + 1}. ${stripMarks(s.headline) || "(empty)"} — ${s.subheadline || "(empty)"}`)
    .join("\n");
  return `${describeApp(input)}\n\nSlides requested: ${input.count}\n\nCurrent captions, for reference (rewrite them freely):\n${current}`;
}

/** Trims and enforces the limits the prompt asks for, in case the model drifts. */
export function cleanScreenshotCopy(copy: ScreenshotCopy, count: number, tracked: string[]): ScreenshotCopy {
  const known = new Set(tracked.map((t) => t.toLowerCase()));
  const slides = copy.slides.slice(0, count).map((s) => {
    let headline = s.headline.trim().replace(/\.$/, "");
    const marks = headline.match(/\*/g)?.length ?? 0;
    if (marks % 2 !== 0) headline = stripMarks(headline);
    if (stripMarks(headline).length > HEADLINE_SOFT_LIMIT + 10) headline = stripMarks(headline).slice(0, HEADLINE_SOFT_LIMIT + 10).trim();
    const subheadline = s.subheadline.trim().slice(0, SUBHEADLINE_SOFT_LIMIT + 20);
    const keyword = known.has(s.keyword.trim().toLowerCase()) ? s.keyword.trim() : "";
    return { headline, subheadline, keyword };
  });
  while (slides.length < count) slides.push({ headline: "", subheadline: "", keyword: "" });
  return { slides, notes: copy.notes.slice(0, 3) };
}

// ---------- Icon concepts ----------

const hex = z.string();

/** Flat so the structured-output schema stays simple; `toIconSpec` builds the real spec. */
export const iconConceptsSchema = z.object({
  concepts: z.array(
    z.object({
      name: z.string(),
      rationale: z.string(),
      backgroundKind: z.enum(["solid", "linear", "radial"]),
      backgroundFrom: hex,
      backgroundTo: hex,
      angle: z.number(),
      glyphKind: z.enum(["letter", "symbol"]),
      letter: z.string(),
      symbol: z.string(),
      glyphColor: hex,
      plateKind: z.enum(["none", "circle", "rounded"]),
      plateColor: hex,
      gloss: z.boolean(),
    }),
  ),
});
export type IconConcepts = z.infer<typeof iconConceptsSchema>;

export const ICON_CONCEPTS_SYSTEM_PROMPT = `You are an app icon designer. You propose icon concepts that read well at 60 px, stand out in search results and fit the app's category, using a small vector system: a background (solid colour or two-colour gradient), an optional plate (a circle or rounded square behind the glyph) and one glyph, either 1–2 letters or a symbol from a fixed list.

Rules:
- Propose 4 clearly different concepts: at least one letter-based and at least one symbol-based, different palettes, not all gradients.
- Colours as 6-digit hex. Pick palettes that are current (deep saturated backgrounds, one bright accent) and avoid the exact colours of the big competitors in the category when you know them.
- Contrast: the glyph must contrast strongly with whatever is right behind it (plate if any, otherwise background).
- symbol must be one of: ${SYMBOL_NAMES.join(", ")}. Choose the one that best matches what the app does; when none fits, use a letter.
- letter: 1 or 2 uppercase characters from the app name (never 3). Fill it even for symbol concepts, as a fallback.
- angle: gradient direction in degrees, 0 = top to bottom, 90 = left to right.
- name: 2–4 Spanish words. rationale: one Spanish sentence on why it fits the app and its keywords.`;

export function buildIconConceptsPrompt(input: CreativeInput): string {
  return describeApp(input);
}

const isHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);

/** Turns a model concept into a valid spec, or null when it cannot be repaired. */
export function toIconSpec(c: IconConcepts["concepts"][number], fallbackLetter: string): IconSpec | null {
  const symbol = SYMBOL_NAMES.find((n) => n === c.symbol.trim().toLowerCase());
  const letter = c.letter.trim().toUpperCase().slice(0, 2) || fallbackLetter;
  const candidate = {
    version: 1 as const,
    background: {
      kind: c.backgroundKind,
      from: isHex(c.backgroundFrom) ? c.backgroundFrom : "#5e6ad2",
      to: isHex(c.backgroundTo) ? c.backgroundTo : isHex(c.backgroundFrom) ? c.backgroundFrom : "#3b44a8",
      angle: Math.max(0, Math.min(360, Math.round(c.angle))),
    },
    glyph: c.glyphKind === "symbol" && symbol ? { kind: "symbol" as const, name: symbol } : { kind: "letter" as const, text: letter, weight: 800 as const },
    glyphColor: isHex(c.glyphColor) ? c.glyphColor : "#ffffff",
    glyphScale: c.glyphKind === "symbol" && symbol ? 0.6 : letter.length === 2 ? 0.5 : 0.58,
    plate: { kind: c.plateKind, color: isHex(c.plateColor) ? c.plateColor : "#ffffff", scale: 0.72 },
    gloss: c.gloss,
    shadow: true,
  };
  const parsed = iconSpecSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

// ---------- Prompts for the image generator ----------

export const logoPromptsSchema = z.object({
  prompts: z.array(
    z.object({
      name: z.string(),
      /** The prompt for the image model, in English. */
      prompt: z.string(),
      rationale: z.string(),
    }),
  ),
});
export type LogoPrompts = z.infer<typeof logoPromptsSchema>;

export const LOGO_PROMPTS_SYSTEM_PROMPT = `You write prompts for an image generation model (OpenAI gpt-image or Google Gemini) to produce app icons. The output of that model is used directly as the App Store / Google Play icon, so the prompt must describe a finished icon, not a mockup.

Write 3 prompts, each a different visual direction (for example: flat geometric symbol, soft 3D glossy object, bold lettermark, playful mascot). Each prompt, in English, must:
- Describe one single centred subject that represents what the app does, with bold simple shapes that stay readable at 60 px.
- Fix the composition: "square app icon, subject centred, fills the frame with small even margins, flat solid or soft gradient background, no border, no rounded-corner frame, no device, no mockup, no hands, no shadow outside the icon".
- Name the exact colours (a background colour and one or two accent colours) that fit the category and stand out from the big competitors in it.
- Say "no text, no letters, no words" unless the direction is a lettermark; for a lettermark give the exact 1–2 uppercase letters and a typeface style, and still forbid any other text.
- Say the style explicitly (flat vector, glossy 3D render, paper cut, isometric…) and "high quality, crisp edges, professional app icon".
- Be 60 to 120 words. No lists, no line breaks.

Also return name (2–4 Spanish words) and rationale (one Spanish sentence linking it to the app and its keywords).`;

export function buildLogoPromptsPrompt(input: CreativeInput): string {
  return describeApp(input);
}

/** Trims the prompts and drops empty ones. */
export function cleanLogoPrompts(output: LogoPrompts): LogoPrompts["prompts"] {
  return output.prompts
    .map((p) => ({ name: p.name.trim().slice(0, 60), prompt: p.prompt.replace(/\s+/g, " ").trim().slice(0, 1500), rationale: p.rationale.trim().slice(0, 300) }))
    .filter((p) => p.prompt.length > 20)
    .slice(0, 4);
}

// ---------- Backgrounds for the screenshots ----------

export const BACKGROUND_PROMPTS_SYSTEM_PROMPT = `You write prompts for an image generation model (OpenAI gpt-image or Google Gemini) to produce BACKGROUND artwork for App Store / Google Play screenshots. A phone mockup and a headline will be drawn on top of the image afterwards, so the image is a backdrop, never a finished screenshot.

Write 3 prompts, each a different visual direction tied to what the app does (for example: soft abstract shapes in the brand colours, a stylised scene from the app's world, bold 3D objects floating, a textured gradient with subtle motifs). Each prompt, in English, must:
- Describe a vertical 9:16 backdrop with the visual interest concentrated at the edges and the bottom, and a calmer, lower-contrast area in the top third where a headline will be placed, plus a calm centre where the phone sits.
- Name the exact colours as hex values (one dominant background colour and one or two accents). When the app's brand colours are given, take them from that palette; otherwise choose colours that fit the category and the app. Say whether the overall image is dark or light.
- Include a few concrete, eye-catching details related to the app's theme (objects, motifs, light effects), but keep them decorative: "no text, no letters, no words, no logos, no phones, no devices, no screens, no people's faces, no watermark".
- Say the style explicitly (soft 3D render, flat vector illustration, paper cut, watercolour, glossy abstract…) and "high quality, clean, professional app store marketing background".
- Be 60 to 120 words. No lists, no line breaks.

Also return name (2–4 Spanish words) and rationale (one Spanish sentence linking it to the app and its keywords).`;

/** What the studio knows about the look: the template colours and the app's own palette. */
export type BackgroundThemeHint = { dark: boolean; background: string; accent: string; palette?: string[] };

export function buildBackgroundPromptsPrompt(input: CreativeInput, theme?: BackgroundThemeHint): string {
  if (!theme) return describeApp(input);
  const palette = theme.palette?.length
    ? `\n\nThe app's own brand colours, read from its icon and screenshots, are ${theme.palette.join(", ")}. Build every direction on this palette: the dominant background colour and the accents must come from it (lighter or darker tints of these colours are fine), and name the hex values in each prompt, so the backdrop looks like it belongs to the app.`
    : "";
  const template = `\n\nThe current template uses a ${theme.dark ? "dark" : "light"} background (${theme.background}) with accent ${theme.accent}; ${palette ? "use it only to decide whether the image is dark or light" : "prefer directions that harmonise with it"}, unless the focus says otherwise.`;
  return describeApp(input) + palette + template;
}

/** Appends the app's palette to a prompt written by hand, when the prompt does not already name it. */
export function withAppPalette(prompt: string, palette: string[] | undefined): string {
  if (!palette?.length) return prompt;
  const lower = prompt.toLowerCase();
  if (palette.every((c) => lower.includes(c.toLowerCase()))) return prompt;
  return `${prompt.trim()} Use the app's brand colour palette: ${palette.join(", ")}.`;
}
