import { z } from "zod";
import type { Store } from "@/lib/stores/types";

/**
 * Store screenshot sets are built in the browser from this spec: a device preset,
 * a theme and one slide per screenshot. The drawing itself lives in screenshot-render.ts;
 * this file holds the data shape and the pure helpers, so it can be tested without a canvas.
 */

export type FrameKind = "iphone" | "ipad" | "android" | "android-tablet";

export type DevicePreset = {
  id: string;
  store: Store;
  label: string;
  width: number;
  height: number;
  frame: FrameKind;
  /** What the store calls this size. */
  note: string;
};

/** Exact pixel sizes accepted by App Store Connect and Google Play Console. */
export const DEVICE_PRESETS: DevicePreset[] = [
  { id: "iphone-6.9", store: "ios", label: 'iPhone 6,9"', width: 1320, height: 2868, frame: "iphone", note: "iPhone 16 Pro Max, obligatorio" },
  { id: "iphone-6.7", store: "ios", label: 'iPhone 6,7"', width: 1290, height: 2796, frame: "iphone", note: "iPhone 15 Pro Max, también vale para 6,9\"" },
  { id: "iphone-6.5", store: "ios", label: 'iPhone 6,5"', width: 1284, height: 2778, frame: "iphone", note: "iPhone 11 Pro Max, opcional" },
  { id: "ipad-13", store: "ios", label: 'iPad 13"', width: 2064, height: 2752, frame: "ipad", note: "iPad Pro, obligatorio si la app es universal" },
  { id: "android-phone", store: "android", label: "Teléfono Android", width: 1080, height: 1920, frame: "android", note: "9:16, el tamaño habitual" },
  { id: "android-phone-qhd", store: "android", label: "Teléfono Android (QHD)", width: 1440, height: 2560, frame: "android", note: "9:16 en alta resolución" },
  { id: "android-tablet", store: "android", label: 'Tablet Android 10"', width: 1440, height: 2560, frame: "android-tablet", note: "Tablets, opcional" },
];

export function presetsFor(store: Store): DevicePreset[] {
  return DEVICE_PRESETS.filter((p) => p.store === store);
}

export function getPreset(id: string): DevicePreset {
  return DEVICE_PRESETS.find((p) => p.id === id) ?? DEVICE_PRESETS[0];
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal de 6 dígitos");

export const themeSchema = z.object({
  /** Background colour; with `background2` it becomes a vertical gradient. */
  background: hex,
  background2: hex.nullable(),
  text: hex,
  subtext: hex,
  /** Colour of the words marked with *asterisks* in the headline. */
  accent: hex,
  frame: z.enum(["dark", "light"]),
  weight: z.union([z.literal(600), z.literal(700), z.literal(800)]),
  align: z.enum(["center", "left"]),
});
export type ScreenshotTheme = z.infer<typeof themeSchema>;

/** A region of the slide image, as fractions of its width and height, that holds the app screen. */
export const cropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.05).max(1),
  h: z.number().min(0.05).max(1),
});
export type Crop = z.infer<typeof cropSchema>;

export const slideSchema = z.object({
  id: z.string().min(1).max(40),
  headline: z.string().max(120),
  subheadline: z.string().max(200),
  /** A data URL (uploaded) or a same-origin proxy URL (store screenshot); null shows an empty screen. */
  image: z.string().max(1_500_000).nullable(),
  layout: z.enum(["text-top", "text-bottom"]),
  /** The keyword this slide is written for, for the user's reference. */
  keyword: z.string().max(80).nullable(),
  /** The image is already a finished store composition (text, device…): draw it edge to edge, nothing on top. */
  asIs: z.boolean().default(false),
  /** Only this part of the image is the app screen (cut out of a store composition); null uses the whole image. */
  crop: cropSchema.nullable().default(null),
});
export type Slide = z.infer<typeof slideSchema>;

export const DECORS = ["none", "glow", "circles", "blob", "stripes", "dots", "wave", "card"] as const;
export type Decor = (typeof DECORS)[number];

export const DECOR_LABEL: Record<Decor, string> = {
  none: "Sin adorno",
  glow: "Resplandor",
  circles: "Círculos panorámicos",
  blob: "Mancha",
  stripes: "Rayas",
  dots: "Puntos",
  wave: "Ola",
  card: "Tarjeta",
};

/** Fields added after the first release carry defaults so saved designs keep parsing. */
export const screenshotSpecSchema = z.object({
  version: z.literal(1),
  device: z.string().min(1),
  theme: themeSchema,
  /** Device width as a fraction of the canvas width. */
  deviceScale: z.number().min(0.4).max(1),
  showFrame: z.boolean(),
  /** Template this design started from, for the gallery highlight. */
  template: z.string().default("classic"),
  /** Degrees; positive leans right. */
  deviceRotate: z.number().min(-25).max(25).default(0),
  /** Horizontal shift of the device as a fraction of the width. */
  deviceOffsetX: z.number().min(-0.5).max(0.5).default(0),
  /** Odd slides mirror the shift and the rotation, so a set alternates left and right. */
  alternate: z.boolean().default(false),
  /** Shows the next slide's screen on a second device behind the first. */
  pair: z.boolean().default(false),
  decor: z.enum(DECORS).default("none"),
  /** Multiplier on the headline and subheadline sizes. */
  textScale: z.number().min(0.7).max(1.5).default(1),
  /** URL of a generated backdrop (/api/assets/generated/{id}); drawn under the decor, covering the canvas. */
  backgroundImage: z.string().max(200).nullable().default(null),
  /** How much of the theme background colour is laid over the backdrop so the text stays readable (0–0.9). */
  backgroundDim: z.number().min(0).max(0.9).default(0.3),
  slides: z.array(slideSchema).min(1).max(10),
});
export type ScreenshotSpec = z.infer<typeof screenshotSpecSchema>;

/** Everything a template sets; the slides and the device size are left alone. */
export type TemplateStyle = Pick<ScreenshotSpec, "theme" | "deviceScale" | "showFrame" | "deviceRotate" | "deviceOffsetX" | "alternate" | "pair" | "decor" | "textScale"> & {
  layout: Slide["layout"];
};

export type Template = { id: string; label: string; description: string; style: TemplateStyle };

/** Ready-made palettes; the first one follows the app's own accent. */
export const THEME_PRESETS: { id: string; label: string; theme: ScreenshotTheme }[] = [
  {
    id: "midnight",
    label: "Noche",
    theme: { background: "#0f1115", background2: "#1c2033", text: "#ffffff", subtext: "#b6bccb", accent: "#8c96ff", frame: "dark", weight: 700, align: "center" },
  },
  {
    id: "paper",
    label: "Papel",
    theme: { background: "#f6f6f8", background2: null, text: "#0f1115", subtext: "#5b616e", accent: "#5e6ad2", frame: "dark", weight: 700, align: "center" },
  },
  {
    id: "ocean",
    label: "Océano",
    theme: { background: "#0b3d91", background2: "#1565c0", text: "#ffffff", subtext: "#cfe3ff", accent: "#ffd166", frame: "dark", weight: 800, align: "center" },
  },
  {
    id: "forest",
    label: "Bosque",
    theme: { background: "#0f3b2e", background2: "#1a6b4f", text: "#ffffff", subtext: "#c3e8d5", accent: "#ffcf5c", frame: "light", weight: 700, align: "center" },
  },
  {
    id: "sunset",
    label: "Atardecer",
    theme: { background: "#ff6b4a", background2: "#c62e78", text: "#ffffff", subtext: "#ffe1d6", accent: "#fff2a8", frame: "dark", weight: 800, align: "center" },
  },
  {
    id: "mono",
    label: "Monocromo",
    theme: { background: "#ffffff", background2: null, text: "#111111", subtext: "#666666", accent: "#111111", frame: "dark", weight: 800, align: "left" },
  },
];

const dark = (accent: string, bg = "#0f1115", bg2: string | null = "#1c2033"): ScreenshotTheme => ({
  background: bg,
  background2: bg2,
  text: "#ffffff",
  subtext: "#b6bccb",
  accent,
  frame: "dark",
  weight: 700,
  align: "center",
});

/** Ready-made looks, like a template gallery. Each one is a full style, so picking one is reversible by picking another. */
export const TEMPLATES: Template[] = [
  {
    id: "classic",
    label: "Clásico",
    description: "Titular arriba y móvil centrado. Lo que cualquier tienda espera.",
    style: { theme: THEME_PRESETS[0].theme, deviceScale: 0.8, showFrame: true, deviceRotate: 0, deviceOffsetX: 0, alternate: false, pair: false, decor: "none", textScale: 1, layout: "text-top" },
  },
  {
    id: "tilt",
    label: "Inclinado",
    description: "El móvil ladeado y alternando de lado, con un resplandor detrás.",
    style: { theme: dark("#8c96ff"), deviceScale: 0.82, showFrame: true, deviceRotate: -8, deviceOffsetX: 0.05, alternate: true, pair: false, decor: "glow", textScale: 1, layout: "text-top" },
  },
  {
    id: "duo",
    label: "Dúo",
    description: "Dos móviles: el principal delante y la siguiente pantalla asomando detrás.",
    style: { theme: dark("#ffd166", "#0b3d91", "#1565c0"), deviceScale: 0.66, showFrame: true, deviceRotate: 0, deviceOffsetX: 0.1, alternate: true, pair: true, decor: "circles", textScale: 0.95, layout: "text-top" },
  },
  {
    id: "panorama",
    label: "Panorámica",
    description: "Círculos que continúan de una captura a la siguiente en la galería de la tienda.",
    style: { theme: dark("#ffffff", "#ff6b4a", "#c62e78"), deviceScale: 0.78, showFrame: true, deviceRotate: 0, deviceOffsetX: 0, alternate: false, pair: false, decor: "circles", textScale: 1, layout: "text-top" },
  },
  {
    id: "card",
    label: "Tarjeta",
    description: "Fondo claro y el móvil sobre una tarjeta de color. Sobrio, estilo productividad.",
    style: { theme: { ...THEME_PRESETS[1].theme, accent: "#5e6ad2" }, deviceScale: 0.72, showFrame: true, deviceRotate: 0, deviceOffsetX: 0, alternate: false, pair: false, decor: "card", textScale: 1, layout: "text-top" },
  },
  {
    id: "glow",
    label: "Resplandor",
    description: "Oscuro con un halo de color detrás del móvil y acento neón.",
    style: { theme: dark("#4cc26b", "#07090d", "#0f1a14"), deviceScale: 0.8, showFrame: true, deviceRotate: 0, deviceOffsetX: 0, alternate: false, pair: false, decor: "glow", textScale: 1.05, layout: "text-top" },
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Blanco, sin marco, texto a la izquierda. Para apps de diseño cuidado.",
    style: { theme: THEME_PRESETS[5].theme, deviceScale: 0.84, showFrame: false, deviceRotate: 0, deviceOffsetX: 0, alternate: false, pair: false, decor: "none", textScale: 1, layout: "text-top" },
  },
  {
    id: "wave",
    label: "Ola",
    description: "Una ola de color en la base, texto abajo. Bien para salud y viajes.",
    style: { theme: { ...THEME_PRESETS[2].theme, accent: "#ffd166" }, deviceScale: 0.78, showFrame: true, deviceRotate: 0, deviceOffsetX: 0, alternate: false, pair: false, decor: "wave", textScale: 1, layout: "text-bottom" },
  },
  {
    id: "stripes",
    label: "Rayas",
    description: "Bandas diagonales y el móvil inclinado. Enérgico, para fitness o juegos.",
    style: { theme: THEME_PRESETS[4].theme, deviceScale: 0.8, showFrame: true, deviceRotate: 6, deviceOffsetX: -0.04, alternate: true, pair: false, decor: "stripes", textScale: 1.05, layout: "text-top" },
  },
  {
    id: "dots",
    label: "Puntos",
    description: "Trama de puntos sobre verde profundo. Tranquilo, para finanzas o educación.",
    style: { theme: THEME_PRESETS[3].theme, deviceScale: 0.78, showFrame: true, deviceRotate: 0, deviceOffsetX: 0, alternate: false, pair: false, decor: "dots", textScale: 1, layout: "text-top" },
  },
  {
    id: "bold",
    label: "Gran titular",
    description: "Titular enorme y el móvil cortado abajo. Una idea por pantalla.",
    style: { theme: dark("#ffcc80", "#111111", "#2a2a2a"), deviceScale: 0.92, showFrame: true, deviceRotate: 0, deviceOffsetX: 0, alternate: false, pair: false, decor: "blob", textScale: 1.3, layout: "text-top" },
  },
  {
    id: "float",
    label: "Flotante",
    description: "Móvil pequeño, ladeado y flotando sobre círculos; texto abajo.",
    style: { theme: dark("#8fdba5", "#0f3b2e", "#1a6b4f"), deviceScale: 0.7, showFrame: true, deviceRotate: 7, deviceOffsetX: 0.03, alternate: true, pair: false, decor: "circles", textScale: 1, layout: "text-bottom" },
  },
];

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

/** Applies a template's look to a spec, keeping its slides, device preset and images. */
export function applyTemplate(spec: ScreenshotSpec, template: Template): ScreenshotSpec {
  const { layout, ...style } = template.style;
  return { ...spec, ...style, template: template.id, slides: spec.slides.map((s) => ({ ...s, layout })) };
}

export function slideId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** A starting point: the store's own screenshots on the first preset of the store. */
export function defaultScreenshotSpec(store: Store, title: string, images: string[]): ScreenshotSpec {
  const preset = presetsFor(store)[0];
  const sources = images.length > 0 ? images.slice(0, 5) : [null];
  const { layout, ...style } = TEMPLATES[0].style;
  return {
    version: 1,
    device: preset.id,
    ...style,
    template: TEMPLATES[0].id,
    backgroundImage: null,
    backgroundDim: 0.3,
    slides: sources.map((image, i) => ({
      id: slideId(),
      headline: i === 0 ? `*${title}*` : "",
      subheadline: "",
      image,
      layout,
      keyword: null,
      // Store screenshots are finished compositions (text, device…): show them as they are.
      asIs: image !== null,
      crop: null,
    })),
  };
}

export type TextRun = { text: string; accent: boolean };

/**
 * Splits a headline into runs: words wrapped in *asterisks* are highlighted.
 * "Corre *más rápido*" → [Corre ] [más rápido]
 */
export function parseRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), accent: false });
    runs.push({ text: m[1], accent: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), accent: false });
  return runs.filter((r) => r.text.length > 0);
}

export function stripMarks(text: string): string {
  return text.replace(/\*/g, "");
}

export type Word = { text: string; accent: boolean };
export type Line = Word[];

/** Words with their highlight flag, keeping single spaces between them. */
export function words(text: string): Word[] {
  const out: Word[] = [];
  for (const run of parseRuns(text)) {
    for (const w of run.text.split(/\s+/)) if (w) out.push({ text: w, accent: run.accent });
  }
  return out;
}

/**
 * Greedy word wrap. `measure` returns the width of a string in the current font.
 * Explicit line breaks in the text are respected.
 */
export function wrapWords(text: string, maxWidth: number, measure: (s: string) => number): Line[] {
  const lines: Line[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line: Line = [];
    for (const word of words(paragraph)) {
      const candidate = [...line, word].map((w) => w.text).join(" ");
      if (line.length > 0 && measure(candidate) > maxWidth) {
        lines.push(line);
        line = [word];
      } else {
        line.push(word);
      }
    }
    if (line.length > 0) lines.push(line);
  }
  return lines;
}

/** Characters the store shows comfortably: beyond this, headlines wrap to three lines. */
export const HEADLINE_SOFT_LIMIT = 34;
export const SUBHEADLINE_SOFT_LIMIT = 70;

/** Bytes of a JSON spec: slides carry base64 images and server actions cap the request body. */
export function specBytes(spec: ScreenshotSpec): number {
  return new TextEncoder().encode(JSON.stringify(spec)).length;
}
export const MAX_SPEC_BYTES = 3_500_000;

/** Same-origin URL for a store screenshot (see app/api/assets/image/route.ts). */
/** Where a generated image (logo or backdrop) is served from. */
export function generatedImageUrl(id: number): string {
  return `/api/assets/generated/${id}`;
}

export function proxied(url: string): string {
  return `/api/assets/image?url=${encodeURIComponent(url)}`;
}
