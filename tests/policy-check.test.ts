import { describe, expect, it } from "vitest";
import type { MetadataDraft } from "@/lib/metadata-check";
import { isHealthCategory, POLICY_RULES, policyCheck, type PolicyContext, REVIEWED_AT } from "@/lib/policy-check";
import type { Store } from "@/lib/stores/types";
import listingV2 from "./fixtures/recordatorio/listing-v2.json";
import observed from "./fixtures/recordatorio/proposal-observed.json";

const draft = (d: Partial<MetadataDraft>): MetadataDraft => ({ title: "", subtitle: "", keywordField: "", shortDescription: "", description: "", ...d });

/** Issues of one rule only. */
const hits = (ruleId: string, store: Store, d: Partial<MetadataDraft>, ctx: PolicyContext = { lang: "es" }) =>
  policyCheck(store, draft(d), ctx, POLICY_RULES.filter((r) => r.id === ruleId));

describe("rule metadata", () => {
  it("every rule has a unique id, an official link and the review date", () => {
    expect(new Set(POLICY_RULES.map((r) => r.id)).size).toBe(POLICY_RULES.length);
    for (const r of POLICY_RULES) {
      expect(r.link).toMatch(/^https:\/\/(support\.google\.com|developer\.apple\.com)\//);
      expect(r.reviewedAt).toBe(REVIEWED_AT);
    }
  });
});

describe("Google Play title", () => {
  it("emojis and emoticons", () => {
    expect(hits("play.title.emoji", "android", { title: "Pastillas 💊 Recordatorio" })[0]).toMatchObject({ level: "error", text: expect.stringContaining("💊") });
    expect(hits("play.title.emoji", "android", { title: "Runly :) correr" })).toHaveLength(1);
    expect(hits("play.title.emoji", "android", { title: "Runly® Correr" })).toEqual([]);
  });

  it("decorative and repeated symbols", () => {
    expect(hits("play.title.symbols", "android", { title: "★ Pastillero ★" })).toHaveLength(1);
    expect(hits("play.title.symbols", "android", { title: "Pastillero!!!" })[0].text).toContain("!!!");
    expect(hits("play.title.symbols", "android", { title: "Runly: Correr y GPS" })).toEqual([]);
  });

  it("sustained capitals, except the brand", () => {
    expect(hits("play.title.caps", "android", { title: "Runly CORRER RÁPIDO" })[0].text).toContain("CORRER RÁPIDO");
    expect(hits("play.title.caps", "android", { title: "Recordatorio PASTILLAS" })).toHaveLength(1);
    expect(hits("play.title.caps", "android", { title: "NASA: noticias del espacio" })).toEqual([]);
    expect(hits("play.title.caps", "android", { title: "Runly: correr con GPS" })).toEqual([]);
  });

  it("promotion, price, ranking and «nuevo» in every supported language", () => {
    const cases = ["Pastillero gratis", "El mejor pastillero", "Pastillero nº1", "Pill reminder #1", "Best pill reminder", "Lembrete grátis", "Rappel gratuit", "Pillen kostenlos", "Promemoria gratis", "Pastillero nuevo", "Top recordatorio", "Recordatorio 50% descuento"];
    for (const title of cases) expect(hits("play.title.promo", "android", { title }, {}), title).toHaveLength(1);
    expect(hits("play.title.promo", "android", { title: "Recordatorio pastillas y toma" })).toEqual([]);
    // "top 10 de funciones" is not "top 1".
    expect(hits("play.title.promo", "android", { title: "Pastillas en 10 segundos" })).toEqual([]);
  });

  it("calls to action in the title or short description", () => {
    expect(hits("play.title.cta", "android", { title: "Pastillero: descárgala ya" })).toHaveLength(1);
    expect(hits("play.title.cta", "android", { shortDescription: "Download now and never miss a pill" })).toHaveLength(1);
    expect(hits("play.title.cta", "android", { title: "Pastillero: descarga el informe" })).toEqual([]);
  });
});

describe("Google Play descriptions", () => {
  it("promo in the short description is a warning", () => {
    expect(hits("play.short.promo", "android", { shortDescription: "El mejor pastillero, gratis" })[0]).toMatchObject({ level: "warn" });
    expect(hits("play.short.promo", "android", { shortDescription: "Pastillero digital fácil" })).toEqual([]);
  });

  it("price and strong ranking claims in the description", () => {
    expect(hits("play.description.promo", "android", { description: "Es la mejor app para tus pastillas." })).toHaveLength(1);
    expect(hits("play.description.promo", "android", { description: "Sin anuncios y gratis." })).toHaveLength(1);
    // "mejor adherencia" is not a ranking claim.
    expect(hits("play.description.promo", "android", { description: "Consigue una mejor adherencia al tratamiento." })).toEqual([]);
  });

  it("keyword density: more than 3 uses of a phrase, or a single word too often", () => {
    const ctx = { lang: "es", keywords: ["recordatorio de pastillas", "pastillas"] };
    const four = Array.from({ length: 4 }, () => "Un recordatorio de pastillas fiable.").join(" ");
    expect(hits("play.description.density", "android", { description: four }, ctx)[0].text).toContain("recordatorio de pastillas (4 veces");
    const three = Array.from({ length: 3 }, () => "Un recordatorio de pastillas fiable.").join(" ");
    expect(hits("play.description.density", "android", { description: three }, ctx)).toEqual([]);
    expect(hits("play.description.density", "android", { description: four }, { lang: "es" })).toEqual([]);
  });

  it("keyword lists without sentences", () => {
    expect(hits("play.description.keyword-list", "android", { description: "Keywords: pastillas, alarma, medicina" })).toHaveLength(1);
    expect(hits("play.description.keyword-list", "android", { description: "pastillas, alarma, medicina, pastillero, salud, toma, dosis" })).toHaveLength(1);
    expect(hits("play.description.keyword-list", "android", { description: "pastillas\nalarma\nmedicina\npastillero\nsalud\ndosis" })).toHaveLength(1);
    expect(hits("play.description.keyword-list", "android", { description: listingV2.draft.description })).toEqual([]);
  });

  it("unattributed testimonials", () => {
    expect(hits("play.description.testimonial", "android", { description: "★★★★★ ¡La mejor app que he probado!" })).toHaveLength(1);
    expect(hits("play.description.testimonial", "android", { description: "«Nunca más me olvido de una pastilla» — un usuario" })).toHaveLength(1);
    expect(hits("play.description.testimonial", "android", { description: "«Nunca más me olvido de una pastilla» — El País" })).toEqual([]);
    expect(hits("play.description.testimonial", "android", { description: listingV2.draft.description })).toEqual([]);
  });
});

describe("other apps and brands", () => {
  const ctx = { lang: "es", brands: ["mytherapy", "medisafe"] };
  it("flags competitor brands in the visible fields", () => {
    expect(hits("other-apps", "android", { description: "Una alternativa a MyTherapy, más sencilla." }, ctx)[0].text).toContain("mytherapy");
    expect(hits("other-apps", "ios", { subtitle: "Como Medisafe" }, ctx)).toHaveLength(1);
    expect(hits("other-apps", "android", { description: "Tu pastillero digital." }, ctx)).toEqual([]);
  });
  it("is an error in the App Store keyword field", () => {
    expect(hits("ios.keywords.other-apps", "ios", { keywordField: "pastillas,medisafe" }, ctx)[0]).toMatchObject({ level: "error" });
    expect(hits("ios.keywords.other-apps", "ios", { keywordField: "pastillas,alarma" }, ctx)).toEqual([]);
  });
});

describe("health apps", () => {
  const health = { lang: "es", category: "Medicina" };
  it("detects health categories in several languages", () => {
    expect(["Medicina", "Medical", "Health & Fitness", "Salud y bienestar", "Médecine", "Gesundheit & Fitness"].every(isHealthCategory)).toBe(true);
    expect(isHealthCategory("Productividad")).toBe(false);
    expect(isHealthCategory(null)).toBe(false);
  });

  it("reminds about the health declaration in Play Console", () => {
    expect(hits("play.health.declaration", "android", { title: "Pastillero" }, health)[0]).toMatchObject({ level: "info", link: expect.stringContaining("16679511") });
    expect(hits("play.health.declaration", "android", { title: "Pastillero" }, { category: "Productividad" })).toEqual([]);
    expect(hits("play.health.declaration", "ios", { title: "Pastillero" }, health)).toEqual([]);
  });

  it("warns about diagnosis, cure or treatment claims, not about disclaimers", () => {
    expect(hits("health.claims", "android", { description: "Esta app cura la ansiedad." }, health)).toHaveLength(1);
    expect(hits("health.claims", "android", { description: "Previene enfermedades del corazón." }, health)).toHaveLength(1);
    expect(hits("health.claims", "android", { description: "The app diagnoses your symptoms." }, health)).toHaveLength(1);
    expect(hits("health.claims", "android", { description: "No diagnostica ni cura ninguna enfermedad." }, health)).toEqual([]);
    expect(hits("health.claims", "android", { description: "Previene olvidos de tu tratamiento." }, health)).toEqual([]);
    expect(hits("health.claims", "android", { description: "Esta app cura la ansiedad." }, { lang: "es" })).toEqual([]);
  });

  it("suggests the «no sustituye el consejo médico» disclaimer when it is missing", () => {
    expect(hits("health.disclaimer", "android", { description: "Tu pastillero digital." }, health)[0]).toMatchObject({ level: "info" });
    expect(hits("health.disclaimer", "android", { description: listingV2.draft.description }, health)).toEqual([]);
    expect(hits("health.disclaimer", "android", { description: "Tu pastillero digital." }, { lang: "es" })).toEqual([]);
  });
});

describe("App Store", () => {
  it("price in the name or subtitle", () => {
    expect(hits("ios.name.price", "ios", { subtitle: "Recordatorio gratis" })[0]).toMatchObject({ level: "error" });
    expect(hits("ios.name.price", "ios", { subtitle: "Recordatorio de pastillas" })).toEqual([]);
  });
  it("unverifiable claims in the name or subtitle", () => {
    expect(hits("ios.name.claims", "ios", { subtitle: "El pastillero nº 1" })).toHaveLength(1);
    expect(hits("ios.name.claims", "ios", { subtitle: "Pastillero con alarmas" })).toEqual([]);
  });
  it("specific prices in the description", () => {
    expect(hits("ios.description.price", "ios", { description: "Premium por 2,99 € al mes." })).toHaveLength(1);
    expect(hits("ios.description.price", "ios", { description: "Premium con informes en PDF." })).toEqual([]);
  });
  it("redundant plurals in the keyword field", () => {
    expect(hits("ios.keywords.plural", "ios", { title: "Pastilla", keywordField: "pastillas,alarma,alarmas" })[0].text).toContain("pastillas, alarmas");
    expect(hits("ios.keywords.plural", "ios", { keywordField: "pastillas,alarma" })).toEqual([]);
  });
  it("category name or «app» in the keyword field", () => {
    expect(hits("ios.keywords.category", "ios", { keywordField: "pastillas,medical,app" }, { lang: "en", category: "Medical" })[0].text).toContain("medical, app");
    expect(hits("ios.keywords.category", "ios", { keywordField: "pastillas,alarma" }, { lang: "es", category: "Medical" })).toEqual([]);
  });
});

describe("store scope", () => {
  it("skips rules and fields of the other store", () => {
    expect(policyCheck("ios", draft({ title: "Pastillero 💊" }))).toEqual([]);
    expect(policyCheck("android", draft({ title: "Runly", keywordField: "medisafe" }), { brands: ["medisafe"] })).toEqual([]);
  });
});

describe("real case: the observed proposal (Anexo B)", () => {
  const ctx = { lang: "es", category: observed.category, keywords: ["recordatorio de pastillas", "recordatorio de medicamentos", "pastillero digital"] };
  const issues = policyCheck("android", draft(observed.fields), ctx);
  const ids = issues.map((i) => i.ruleId);

  it("gets a density warning and a promo warning for «gratis», each with its link", () => {
    expect(ids).toContain("play.description.density");
    expect(ids).toContain("play.description.promo");
    expect(issues.find((i) => i.ruleId === "play.description.density")?.text).toContain("recordatorio de pastillas (6 veces");
    expect(issues.find((i) => i.ruleId === "play.description.promo")?.text).toContain("«gratis»");
    expect(issues.every((i) => i.link)).toBe(true);
  });

  it("reminds about the health declaration and the missing disclaimer", () => {
    expect(ids).toEqual(expect.arrayContaining(["play.health.declaration", "health.disclaimer"]));
  });

  it("the published listing v2 only gets the health declaration reminder", () => {
    const v2 = policyCheck("android", listingV2.draft, { ...ctx, category: listingV2.category });
    expect(v2.map((i) => i.ruleId)).toEqual(["play.health.declaration"]);
  });
});
