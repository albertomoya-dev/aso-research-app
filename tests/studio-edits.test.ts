import { describe, expect, it } from "vitest";
import { defaultScreenshotSpec, getTemplate, type ScreenshotSpec } from "@/lib/assets/screenshots";
import { applyTemplateWith, backgroundMode, customLook, gradientPartner, reorder, templateWouldOverwrite } from "@/lib/assets/studio-edits";

const base = (): ScreenshotSpec => defaultScreenshotSpec("ios", "App", []);

describe("reorder", () => {
  it("moves an item down and up", () => {
    expect(reorder(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(reorder(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("clamps out-of-range targets and leaves the list alone when nothing moves", () => {
    expect(reorder(["a", "b", "c"], 0, 9)).toEqual(["b", "c", "a"]);
    expect(reorder(["a", "b", "c"], 2, -1)).toEqual(["c", "a", "b"]);
    const list = ["a", "b"];
    const same = reorder(list, 1, 1);
    expect(same).toEqual(list);
    expect(same).not.toBe(list);
    expect(reorder([], 0, 1)).toEqual([]);
  });
});

describe("customLook / templateWouldOverwrite (H23)", () => {
  it("a fresh design has nothing of its own to lose", () => {
    const spec = base();
    expect(customLook(spec)).toEqual({ colors: false, background: false });
    expect(templateWouldOverwrite(spec, getTemplate("tilt"))).toBe(false);
  });
  it("edited colours are detected, case-insensitively", () => {
    const spec = base();
    const same = { ...spec, theme: { ...spec.theme, background: spec.theme.background.toUpperCase() } };
    expect(customLook(same).colors).toBe(false);
    const edited = { ...spec, theme: { ...spec.theme, accent: "#123456" } };
    expect(customLook(edited).colors).toBe(true);
    expect(templateWouldOverwrite(edited, getTemplate("tilt"))).toBe(true);
  });
  it("a template with exactly the current colours overwrites nothing", () => {
    const spec = base();
    const card = getTemplate("card");
    const looksLikeCard = { ...spec, theme: { ...spec.theme, ...card.style.theme } };
    expect(customLook(looksLikeCard).colors).toBe(true);
    expect(templateWouldOverwrite(looksLikeCard, card)).toBe(false);
  });
  it("an AI backdrop is reported apart", () => {
    const spec = { ...base(), backgroundImage: "/api/assets/generated/1" };
    expect(customLook(spec)).toEqual({ colors: false, background: true });
  });
});

describe("applyTemplateWith", () => {
  const custom = (): ScreenshotSpec => {
    const spec = base();
    return {
      ...spec,
      theme: { ...spec.theme, background: "#101010", background2: "#202020", text: "#fafafa", subtext: "#cccccc", accent: "#ff0066" },
      backgroundImage: "/api/assets/generated/7",
      backgroundDim: 0.5,
    };
  };
  it("keeps the five colours and the backdrop when asked", () => {
    const spec = custom();
    const out = applyTemplateWith(spec, getTemplate("tilt"), { keepColors: true });
    expect(out.template).toBe("tilt");
    expect(out.decor).toBe("glow");
    expect(out.deviceRotate).toBe(-8);
    expect(out.theme).toMatchObject({ background: "#101010", background2: "#202020", text: "#fafafa", subtext: "#cccccc", accent: "#ff0066" });
    expect(out.backgroundImage).toBe("/api/assets/generated/7");
    expect(out.backgroundDim).toBe(0.5);
  });
  it("takes the template's colours otherwise, still keeping the backdrop", () => {
    const card = getTemplate("card");
    const out = applyTemplateWith(custom(), card, { keepColors: false });
    expect(out.theme).toEqual(card.style.theme);
    expect(out.backgroundImage).toBe("/api/assets/generated/7");
  });
});

describe("backgroundMode / gradientPartner", () => {
  it("reads the mode from the spec", () => {
    const spec = base();
    expect(backgroundMode({ ...spec, theme: { ...spec.theme, background2: null } })).toBe("solid");
    expect(backgroundMode({ ...spec, theme: { ...spec.theme, background2: "#000000" } })).toBe("gradient");
    expect(backgroundMode({ ...spec, backgroundImage: "/x" })).toBe("ai");
  });
  it("lightens dark colours and darkens light ones", () => {
    expect(gradientPartner("#000000")).toBe("#404040");
    expect(gradientPartner("#ffffff")).toBe("#cccccc");
  });
});
