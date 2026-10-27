import { describe, expect, it } from "vitest";
import { darkMask, detectScreenInMask } from "@/lib/assets/screen-detect";

/** A w×h RGBA image: light background, a dark phone body with a light screen inside. */
function composition(w: number, h: number, body: { x: number; y: number; w: number; h: number } | null, bezel = 6, bg = [40, 120, 90]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = bg;
      if (body && x >= body.x && x < body.x + body.w && y >= body.y && y < body.y + body.h) {
        const inner = x >= body.x + bezel && x < body.x + body.w - bezel && y >= body.y + bezel && y < body.y + body.h - bezel;
        c = inner ? [245, 245, 248] : [24, 24, 28];
      }
      px.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }
  }
  return px;
}

describe("detectScreenInMask", () => {
  it("finds the screen inside a dark phone body", () => {
    const w = 200;
    const h = 360;
    const body = { x: 40, y: 80, w: 120, h: 240 };
    const crop = detectScreenInMask(darkMask(composition(w, h, body), w, h), w, h);
    expect(crop).not.toBeNull();
    // The screen is the body minus the bezel (plus a 1 px nudge inside).
    expect(crop!.x * w).toBeCloseTo(body.x + 6 + 1, 0);
    expect(crop!.y * h).toBeCloseTo(body.y + 6 + 1, 0);
    expect(crop!.w * w).toBeCloseTo(body.w - 12 - 2, 0);
    expect(crop!.h * h).toBeCloseTo(body.h - 12 - 2, 0);
  });

  it("gives up without a body, or when the whole image is dark", () => {
    const w = 120;
    const h = 200;
    expect(detectScreenInMask(darkMask(composition(w, h, null), w, h), w, h)).toBeNull();
    const dark = composition(w, h, null, 6, [10, 10, 12]);
    expect(detectScreenInMask(darkMask(dark, w, h), w, h)).toBeNull();
  });

  it("ignores a dark coloured background", () => {
    // Navy is dark but saturated, so it is not taken for the device body.
    const w = 200;
    const h = 360;
    const body = { x: 40, y: 80, w: 120, h: 240 };
    const crop = detectScreenInMask(darkMask(composition(w, h, body, 6, [12, 30, 90]), w, h), w, h);
    expect(crop).not.toBeNull();
  });
});
