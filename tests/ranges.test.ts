import { describe, expect, it } from "vitest";
import { charOffset, checkMetadata, type MetadataDraft, phraseRanges, type Range } from "@/lib/metadata-check";
import { locateTerms, mergeRanges, POLICY_RULES, policyCheck, type PolicyContext } from "@/lib/policy-check";
import type { Store } from "@/lib/stores/types";
import { foldWithMap, wordSpans } from "@/lib/text";

const draft = (d: Partial<MetadataDraft>): MetadataDraft => ({ title: "", subtitle: "", keywordField: "", shortDescription: "", description: "", ...d });
const quoted = (text: string, ranges: Range[] | undefined) => (ranges ?? []).map(([a, b]) => text.slice(a, b));
const rule = (ruleId: string, store: Store, d: Partial<MetadataDraft>, ctx: PolicyContext = { lang: "es" }) =>
  policyCheck(store, draft(d), ctx, POLICY_RULES.filter((r) => r.id === ruleId));

describe("foldWithMap", () => {
  it("maps folded positions back to the original, decomposed accents included", () => {
    const nfd = "Médico";
    const { folded, at } = foldWithMap(nfd);
    expect(folded).toBe("medico");
    expect(at).toHaveLength(folded.length + 1);
    expect(at[2]).toBe(3); // «d» comes after «e» + combining accent
    expect(at.at(-1)).toBe(nfd.length);
  });
});

describe("phraseRanges", () => {
  it("finds every occurrence in the original text, ignoring case, accents and punctuation", () => {
    const text = "Recordatorio de pastillas. RECORDATORIO, de pastillas y más";
    expect(quoted(text, phraseRanges(text, "recordatorio de pastillas"))).toEqual(["Recordatorio de pastillas", "RECORDATORIO, de pastillas"]);
  });

  it("covers accented words whole, composed and decomposed (NFD)", () => {
    const composed = "Alarma de medicación diaria";
    expect(quoted(composed, phraseRanges(composed, "medicacion"))).toEqual(["medicación"]);
    const nfd = "Alarma de medicación diaria";
    expect(quoted(nfd, phraseRanges(nfd, "medicación"))).toEqual(["medicación"]);
    // The accent at the very end of the text stays inside the range.
    const tail = "toma de café";
    expect(quoted(tail, phraseRanges(tail, "cafe"))).toEqual(["café"]);
  });

  it("only whole words, and nothing for an empty phrase", () => {
    expect(phraseRanges("pastillero pastilla", "pastilla")).toEqual([[11, 19]]);
    expect(phraseRanges("texto", "  ")).toEqual([]);
  });

  it("emojis before the words do not shift the positions", () => {
    const text = "💊💊 Pastillas";
    expect(quoted(text, phraseRanges(text, "pastillas"))).toEqual(["Pastillas"]);
    expect(wordSpans(text)[0]).toMatchObject({ word: "pastillas", start: 5 });
  });
});

describe("locateTerms and mergeRanges", () => {
  it("finds folded matches, with spaces or punctuation between their words", () => {
    const text = "¡Descárgala YA! y descarga,  ya";
    expect(quoted(text, locateTerms(text, ["descargala ya", "descarga ya"]))).toEqual(["Descárgala YA", "descarga,  ya"]);
  });
  it("a clipped match is found by its beginning", () => {
    const text = "pill reminder, med reminder, pill tracker, med tracker, pill box";
    expect(locateTerms(text, ["pill reminder, med remi…"])).toEqual([[0, 23]]);
  });
  it("merges overlapping ranges", () => {
    expect(mergeRanges([[5, 8], [0, 3], [2, 4], [8, 9], [7, 7]])).toEqual([[0, 4], [5, 9]]);
  });
});

describe("policy issues carry the field and the exact words", () => {
  it("promo terms in the title", () => {
    const title = "La Mejor app GRATIS";
    const [issue] = rule("play.title.promo", "android", { title });
    expect(issue.field).toBe("title");
    expect(quoted(title, issue.ranges)).toEqual(["Mejor", "GRATIS"]);
  });

  it("emojis, with their real UTF-16 length", () => {
    const title = "Pastillas 💊 Alarma";
    const [issue] = rule("play.title.emoji", "android", { title });
    expect(quoted(title, issue.ranges)).toEqual(["💊"]);
  });

  it("decorative and repeated symbols", () => {
    const title = "Pastillas ★ Alarma!!!";
    expect(quoted(title, rule("play.title.symbols", "android", { title })[0].ranges)).toEqual(["★", "!!!"]);
  });

  it("sustained capitals, with their case (the same words in lower case are fine)", () => {
    const title = "Runly: CORRER RAPIDO correr";
    expect(quoted(title, rule("play.title.caps", "android", { title })[0].ranges)).toEqual(["CORRER RAPIDO"]);
  });

  it("calls to action in the short description, with accents", () => {
    const shortDescription = "Tus tomas a tiempo. ¡Descárgala ya!";
    const [issue] = rule("play.title.cta", "android", { shortDescription });
    expect(issue.field).toBe("shortDescription");
    expect(quoted(shortDescription, issue.ranges)).toEqual(["Descárgala ya"]);
  });

  it("other apps and brands", () => {
    const description = "Mejor que Medisafe. Compatible con medisafe y MyTherapy.";
    const [issue] = rule("other-apps", "android", { description }, { lang: "es", brands: ["Medisafe", "MyTherapy"] });
    expect(quoted(description, issue.ranges)).toEqual(["Medisafe", "medisafe", "MyTherapy"]);
  });

  it("health claims on a decomposed (NFD) text", () => {
    const description = "La app previene la diabetes tipo dos. Te recuerda la toma.".normalize("NFD");
    const [issue] = rule("health.claims", "android", { description }, { lang: "es", category: "Medicina" });
    expect(quoted(description, issue.ranges)).toEqual(["previene la diabetes tipo dos"]);
  });

  it("App Store: prices in the description and brands as whole words in the keyword field", () => {
    const description = "Plan anual por 9,99 € o $4.";
    expect(quoted(description, rule("ios.description.price", "ios", { description })[0].ranges)).toEqual(["9,99 €", "$4"]);
    const keywordField = "pastillas,medisafe,alarma";
    expect(quoted(keywordField, rule("ios.keywords.other-apps", "ios", { keywordField }, { brands: ["Medisafe"] })[0].ranges)).toEqual(["medisafe"]);
  });

  it("density: every repetition of the stuffed phrase", () => {
    const description = Array.from({ length: 5 }, () => "Recordatorio de pastillas para ti.").join(" ");
    const [issue] = rule("play.description.density", "android", { description }, { lang: "es", keywords: ["recordatorio de pastillas"] });
    expect(issue.ranges).toHaveLength(5);
    expect(new Set(quoted(description, issue.ranges))).toEqual(new Set(["Recordatorio de pastillas"]));
  });

  it("keyword share: the stuffed paragraph, from its first word to its last", () => {
    const keywords = ["pill reminder", "med reminder", "pill tracker", "med tracker", "pill box", "medication reminder", "pill organizer"];
    const description = "\n\npill reminder med reminder pill tracker med tracker pill box medication reminder pill organizer daily.";
    const [issue] = rule("play.description.keyword-share", "android", { description }, { lang: "en", keywords });
    expect(quoted(description, issue.ranges)).toEqual(["pill reminder med reminder pill tracker med tracker pill box medication reminder pill organizer daily"]);
  });

  it("whole-field notices have a field but no ranges", () => {
    const [issue] = rule("health.disclaimer", "android", { description: "Recordatorio de tomas." }, { category: "Medicina" });
    expect(issue.field).toBe("description");
    expect(issue.ranges).toBeUndefined();
  });

  it("the Play health declaration is about the listing, not a field", () => {
    const [issue] = rule("play.health.declaration", "android", { title: "Pastillero" }, { category: "Medicina" });
    expect(issue.field).toBeUndefined();
    expect(issue.ranges).toBeUndefined();
  });
});

describe("checkMetadata issues", () => {
  it("the part over the limit, counted in characters (an emoji is one)", () => {
    const title = `${"💊".repeat(25)} recordatorio`;
    const issue = checkMetadata("android", draft({ title }), []).issues.find((i) => i.ruleId == null && i.field === "title")!;
    expect(issue.ranges).toEqual([[charOffset(title, 30), title.length]]);
    expect([...title.slice(...issue.ranges![0])].length).toBe([...title].length - 30);
  });

  it("App Store keyword field: spaces, words already in the name and repeats", () => {
    const keywordField = "alarma, pastillas,toma,alarma";
    const { issues } = checkMetadata("ios", draft({ title: "Pastillas", keywordField }), []);
    const of = (text: string) => issues.find((i) => i.text.startsWith(text))!;
    expect(quoted(keywordField, of("El campo de keywords gasta").ranges)).toEqual([", "]);
    expect(quoted(keywordField, of("Ya están").ranges)).toEqual(["pastillas"]);
    expect(of("Palabras repetidas").ranges).toEqual([[23, 29]]);
  });
});
