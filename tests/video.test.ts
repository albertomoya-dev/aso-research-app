import { describe, expect, it } from "vitest";
import { DEFAULT_VIDEO_SETTINGS, durationWarning, layersAt, slideAnimation, totalDuration, TRANSITION_SECONDS, VIDEO_PRESETS } from "@/lib/assets/video";

const settings = { ...DEFAULT_VIDEO_SETTINGS, secondsPerSlide: 3 };

describe("timeline", () => {
  it("shows one slide outside transitions and two during a fade", () => {
    expect(layersAt(0.5, settings, 4).map((l) => [l.slide, l.alpha])).toEqual([[0, 1]]);
    const mid = layersAt(3 - TRANSITION_SECONDS / 2, settings, 4);
    expect(mid.map((l) => l.slide)).toEqual([0, 1]);
    expect(mid[1].alpha).toBeGreaterThan(0.5);
    expect(mid[1].alpha).toBeLessThan(1);
  });

  it("never transitions after the last slide and clamps past the end", () => {
    expect(layersAt(2.9, settings, 1)).toHaveLength(1);
    expect(layersAt(99, settings, 3)[0].slide).toBe(2);
    expect(layersAt(1, settings, 0)).toEqual([]);
  });

  it("slides horizontally with the slide transition and not at all with cut", () => {
    const t = 3 - 0.1;
    const slide = layersAt(t, { ...settings, transition: "slide" }, 2);
    expect(slide[0].shiftX).toBeLessThan(0);
    expect(slide[1].shiftX).toBeCloseTo(1 + slide[0].shiftX, 5);
    expect(layersAt(t, { ...settings, transition: "none" }, 2)).toHaveLength(1);
  });

  it("fades the text in and zooms the device out over the slide", () => {
    const start = slideAnimation(0, 3);
    const end = slideAnimation(3, 3);
    expect(start.textAlpha).toBe(0);
    expect(end.textAlpha).toBe(1);
    expect(start.deviceZoom).toBeCloseTo(1.03);
    expect(end.deviceZoom).toBeCloseTo(1);
  });
});

describe("duration", () => {
  it("adds up the slides and warns only for App Store previews outside 15–30 s", () => {
    expect(totalDuration(settings, 5)).toBe(15);
    expect(durationWarning(settings, 5)).toBeNull();
    expect(durationWarning(settings, 4)).toMatch(/12 s/);
    expect(durationWarning({ ...settings, secondsPerSlide: 8 }, 4)).toMatch(/32 s/);
    expect(durationWarning({ ...settings, preset: "vertical-1080x1920" }, 1)).toBeNull();
  });

  it("has even dimensions in every preset (H.264 needs them)", () => {
    for (const p of VIDEO_PRESETS) {
      expect(p.width % 2).toBe(0);
      expect(p.height % 2).toBe(0);
    }
  });
});
