import { z } from "zod";
import type { SlideAnimation } from "./screenshot-render";

/**
 * The promo video plays the saved screenshot set as an animated sequence. This file holds
 * the settings and the timeline maths (pure, tested); video-encode.ts draws and encodes it.
 */

export type VideoPreset = { id: string; label: string; width: number; height: number; note: string };

export const VIDEO_PRESETS: VideoPreset[] = [
  { id: "appstore-886x1920", label: "App Store · 886×1920", width: 886, height: 1920, note: 'App preview para iPhone 6,9" / 6,7" / 6,5"' },
  { id: "vertical-1080x1920", label: "Vertical · 1080×1920", width: 1080, height: 1920, note: "YouTube Shorts, Reels, TikTok y el vídeo de Google Play (vía YouTube)" },
  { id: "square-1080x1080", label: "Cuadrado · 1080×1080", width: 1080, height: 1080, note: "Redes sociales" },
];

export function getVideoPreset(id: string): VideoPreset {
  return VIDEO_PRESETS.find((p) => p.id === id) ?? VIDEO_PRESETS[0];
}

export const videoSettingsSchema = z.object({
  preset: z.string().min(1),
  /** Seconds each screenshot stays on screen, transition included. */
  secondsPerSlide: z.number().min(1.5).max(8),
  transition: z.enum(["fade", "slide", "none"]),
  fps: z.union([z.literal(24), z.literal(30)]),
});
export type VideoSettings = z.infer<typeof videoSettingsSchema>;

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = { preset: VIDEO_PRESETS[0].id, secondsPerSlide: 3.5, transition: "fade", fps: 30 };

/** App Store previews must last 15–30 s; everything else is free. */
export const APP_STORE_PREVIEW = { min: 15, max: 30 };

export const TRANSITION_SECONDS = 0.6;
const TEXT_IN_SECONDS = 0.7;

export function totalDuration(settings: VideoSettings, slideCount: number): number {
  return Math.round(settings.secondsPerSlide * slideCount * 100) / 100;
}

/** A warning when the result does not fit the chosen store, or null. */
export function durationWarning(settings: VideoSettings, slideCount: number): string | null {
  if (settings.preset !== "appstore-886x1920") return null;
  const total = totalDuration(settings, slideCount);
  if (total < APP_STORE_PREVIEW.min) return `App Store exige entre 15 y 30 segundos y este vídeo dura ${total} s: añade pantallas o alarga cada una.`;
  if (total > APP_STORE_PREVIEW.max) return `App Store exige entre 15 y 30 segundos y este vídeo dura ${total} s: quita pantallas o acorta cada una.`;
  return null;
}

export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export type FrameLayer = {
  slide: number;
  /** 0–1 opacity of the whole layer. */
  alpha: number;
  /** Horizontal offset as a fraction of the width (slide transition). */
  shiftX: number;
  anim: SlideAnimation;
};

/** The animation of a slide `local` seconds after it appears. */
export function slideAnimation(local: number, secondsPerSlide: number): SlideAnimation {
  const textIn = easeOut(clamp01(local / TEXT_IN_SECONDS));
  // A slow push-in over the whole slide keeps the device alive without distracting.
  const zoom = 1.03 - 0.03 * clamp01(local / secondsPerSlide);
  return { textAlpha: textIn, textShift: (1 - textIn) * 0.04, deviceZoom: zoom, deviceShift: (1 - easeOut(clamp01(local / (TEXT_IN_SECONDS * 1.4)))) * 0.03 };
}

/** Which slides are visible at time `t` (seconds) and how. At most two during a transition. */
export function layersAt(t: number, settings: VideoSettings, slideCount: number): FrameLayer[] {
  if (slideCount === 0) return [];
  const per = settings.secondsPerSlide;
  const index = Math.min(slideCount - 1, Math.floor(t / per));
  const local = t - index * per;
  const current: FrameLayer = { slide: index, alpha: 1, shiftX: 0, anim: slideAnimation(local, per) };
  const next = index + 1;
  const remaining = per - local;
  if (settings.transition === "none" || next >= slideCount || remaining > TRANSITION_SECONDS) return [current];

  const p = easeOut(clamp01(1 - remaining / TRANSITION_SECONDS));
  // The incoming slide starts its own animation when the transition starts.
  const incoming: FrameLayer = { slide: next, alpha: 1, shiftX: 0, anim: slideAnimation(TRANSITION_SECONDS - remaining, per) };
  if (settings.transition === "fade") return [current, { ...incoming, alpha: p }];
  return [
    { ...current, shiftX: -p },
    { ...incoming, shiftX: 1 - p },
  ];
}
