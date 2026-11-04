import { applyTemplate, getTemplate, type ScreenshotSpec, type ScreenshotTheme, type Template } from "./screenshots";

// Pure edits of the screenshot editor (phase 32): reordering screens, telling whether a template would
// replace the user's own colours (H23), applying it while keeping them, and the background mode.

/** Moves the item at `from` to `to` (both clamped to the list); the same list when nothing moves. */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  if (list.length === 0) return [...list];
  const clamp = (i: number) => Math.max(0, Math.min(list.length - 1, i));
  const a = clamp(from);
  const b = clamp(to);
  if (a === b) return [...list];
  const next = [...list];
  const [item] = next.splice(a, 1);
  next.splice(b, 0, item);
  return next;
}

/** The colours of a theme the user picks by hand: background, gradient, headline, subtitle and accent. */
export const COLOR_KEYS = ["background", "background2", "text", "subtext", "accent"] as const satisfies readonly (keyof ScreenshotTheme)[];

const sameColor = (a: string | null, b: string | null) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

export type CustomLook = {
  /** The colours differ from those of the template the design started from (edited, a preset, «Colores de la app»). */
  colors: boolean;
  /** An AI backdrop is applied. */
  background: boolean;
};

/** What applying another template would replace without asking (H23). */
export function customLook(spec: ScreenshotSpec): CustomLook {
  const base = getTemplate(spec.template).style.theme;
  return {
    colors: COLOR_KEYS.some((k) => !sameColor(spec.theme[k], base[k])),
    background: spec.backgroundImage != null,
  };
}

/** True when a template would replace something the user chose: their colours (the backdrop is always kept). */
export function templateWouldOverwrite(spec: ScreenshotSpec, template: Template): boolean {
  if (!customLook(spec).colors) return false;
  // Picking the template whose colours are already there replaces nothing.
  return COLOR_KEYS.some((k) => !sameColor(spec.theme[k], template.style.theme[k]));
}

/**
 * Applies a template's composition (decor, device pose, text size, layout) and, with `keepColors`,
 * leaves the five colours as they are. The AI backdrop and its veil are never touched.
 */
export function applyTemplateWith(spec: ScreenshotSpec, template: Template, opts: { keepColors: boolean }): ScreenshotSpec {
  const next = applyTemplate(spec, template);
  const kept = opts.keepColors ? Object.fromEntries(COLOR_KEYS.map((k) => [k, spec.theme[k]])) : {};
  return { ...next, theme: { ...next.theme, ...kept }, backgroundImage: spec.backgroundImage, backgroundDim: spec.backgroundDim };
}

export type BackgroundMode = "solid" | "gradient" | "ai";

/** How the background is drawn now: an AI backdrop, a two-colour gradient or one colour. */
export function backgroundMode(spec: ScreenshotSpec): BackgroundMode {
  if (spec.backgroundImage) return "ai";
  return spec.theme.background2 ? "gradient" : "solid";
}

/** A second colour for a new gradient: the background, lighter if it is dark and darker if it is light. */
export function gradientPartner(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const dark = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 < 128;
  const shift = (c: number) => Math.round(dark ? c + (255 - c) * 0.25 : c * 0.8);
  return `#${rgb.map((c) => shift(c).toString(16).padStart(2, "0")).join("")}`;
}
