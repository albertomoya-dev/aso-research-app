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
