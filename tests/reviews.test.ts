import { describe, expect, it } from "vitest";
import {
  aggregateCategoryAsks,
  featureKey,
  buildReviewPrompt,
  coveringFeature,
  EMPTY_REVIEW_ANALYSIS,
  fixOpportunityStatus,
  ourFactsForReviews,
  ratingStats,
  REVIEW_PROMPT_VERSION,
  REVIEW_SYSTEM_PROMPT,
  reviewAnalysisSchema,
  storedReviewAnalysisSchema,
  type ReviewAnalysis,
  withCurrentOpportunityStatus,
} from "@/lib/review-analysis";
import { findInTop5, topCompetitors } from "@/lib/review-queries";
import { toReview } from "@/lib/stores/android";
import { parseReviewFeed } from "@/lib/stores/ios";
import type { Review } from "@/lib/stores/types";
import { featuresFor, type ProductFeature } from "@/lib/product-facts";
import product from "./fixtures/recordatorio/product.json";

const entry = (id: string, rating: string, updated: string) => ({
  id: { label: id },
  updated: { label: updated },
  title: { label: "Muy buena" },
  content: { label: "Me ayuda a correr cada día" },
  "im:rating": { label: rating },
  "im:version": { label: "2.1" },
});

describe("parseReviewFeed", () => {
  it("reads entries and accepts a single entry object", () => {
    expect(parseReviewFeed({ feed: { entry: [entry("1", "5", "2026-10-20T10:00:00-07:00"), entry("2", "2", "2026-10-19T10:00:00-07:00")] } })).toEqual([
      { id: "1", rating: 5, title: "Muy buena", text: "Me ayuda a correr cada día", date: "2026-10-20T17:00:00.000Z", version: "2.1" },
      { id: "2", rating: 2, title: "Muy buena", text: "Me ayuda a correr cada día", date: "2026-10-19T17:00:00.000Z", version: "2.1" },
    ]);
    expect(parseReviewFeed({ feed: { entry: entry("3", "4", "2026-10-18T00:00:00Z") } })).toHaveLength(1);
    expect(parseReviewFeed({ feed: {} })).toEqual([]);
  });
});

describe("toReview (Google Play)", () => {
  it("maps the scraper item", () => {
    expect(
      toReview({
        id: "gp:1",
        userName: "Ana",
        userImage: "",
        date: "2026-10-20T08:00:00.000Z",
        score: 3,
        scoreText: "3",
        url: "",
        title: "",
        text: "Bien",
        replyDate: "",
        replyText: "",
        version: "",
        thumbsUp: 0,
        criterias: [],
      }),
    ).toEqual({ id: "gp:1", rating: 3, title: "", text: "Bien", date: "2026-10-20T08:00:00.000Z", version: null });
  });
});

const review = (rating: number, date: string): Review => ({ id: date, rating, title: "", text: "ok", date, version: null });

describe("ratingStats", () => {
  it("averages and counts per star", () => {
    const stats = ratingStats([review(5, "2026-10-03"), review(4, "2026-10-01"), review(1, "2026-10-02")]);
    expect(stats).toEqual({ count: 3, average: 10 / 3, distribution: [1, 0, 0, 1, 1], from: "2026-10-01", to: "2026-10-03" });
    expect(ratingStats([]).average).toBeNull();
  });
});

describe("buildReviewPrompt", () => {
  it("puts one review per line and clips long ones", () => {
    const prompt = buildReviewPrompt({
      appTitle: "Runly",
      storeName: "App Store",
      countryName: "España",
      lang: "es",
      reviews: [{ ...review(2, "2026-10-01T00:00:00Z"), title: "Lenta", text: "x".repeat(900), version: "3.0" }],
      facts: null,
    });
    expect(prompt).not.toContain("PRODUCT FACTS");
    expect(prompt).toContain("App: Runly (App Store, España, language code es).");
    expect(prompt).toContain("[2★ 2026-10-01 v3.0] Lenta. xxx");
    expect(prompt.split("\n").at(-1)!.length).toBeLessThan(650);
  });
});

describe("buildReviewPrompt with PRODUCT FACTS", () => {
  it("adds the facts and the store version before the reviews", () => {
    const prompt = buildReviewPrompt({
      appTitle: "Runly",
      storeName: "Google Play",
      countryName: "España",
      lang: "es",
      reviews: [review(5, "2026-10-01T00:00:00Z")],
      facts: "PRODUCT FACTS (test):\n- GPS",
      version: "3.1",
    });
    expect(prompt).toContain("Version in the store now: 3.1.");
    expect(prompt.indexOf("PRODUCT FACTS")).toBeLessThan(prompt.indexOf("most recent reviews"));
  });
});

const analysis = (over: Partial<ReviewAnalysis> = {}): ReviewAnalysis => ({ ...EMPTY_REVIEW_ANALYSIS, summary: "Bien", ...over });

describe("review analysis schema", () => {
  it("reads old rows without opportunities and asks the model for them", () => {
    const { opportunities, ...old } = analysis();
    expect(opportunities).toEqual([]);
    expect(storedReviewAnalysisSchema.safeParse(old).success).toBe(true);
    expect(reviewAnalysisSchema.safeParse(old).success).toBe(false);
    const withOpportunities = { ...old, opportunities: [{ need: "Escanear códigos", feature: "Escáner", quote: "ojalá escaneara", status: "next" }] };
    expect(reviewAnalysisSchema.parse(withOpportunities).opportunities).toHaveLength(1);
    expect(storedReviewAnalysisSchema.parse(withOpportunities).opportunities).toHaveLength(1);
    // Rows made before rv-5 have opportunities without status.
    const beforeRv5 = { ...old, opportunities: [{ need: "Escanear códigos", feature: "Escáner", quote: "ojalá escaneara" }] };
    expect(storedReviewAnalysisSchema.safeParse(beforeRv5).success).toBe(true);
    expect(reviewAnalysisSchema.safeParse(beforeRv5).success).toBe(false);
  });
});

describe("buildReviewPrompt for a competitor", () => {
  it("adds our facts in their own section", () => {
    const prompt = buildReviewPrompt({
      appTitle: "Rival",
      storeName: "Google Play",
      countryName: "España",
      lang: "es",
      reviews: [review(2, "2026-10-01T00:00:00Z")],
      facts: null,
      ourFacts: "PRODUCT FACTS (test):\n- Escáner de códigos de barras",
    });
    expect(prompt).toContain("OUR APP: the reviewed app is a competitor of ours");
    expect(prompt).toContain("- Escáner de códigos de barras");
    expect(prompt.indexOf("OUR APP")).toBeLessThan(prompt.indexOf("most recent reviews"));
    expect(buildReviewPrompt({ appTitle: "Runly", storeName: "App Store", countryName: "España", lang: "es", reviews: [], facts: null })).not.toContain(
      "OUR APP",
    );
  });
});

describe("review prompt for a competitor (H19)", () => {
  const input = {
    appTitle: "Medisafe",
    storeName: "Google Play",
    countryName: "España",
    lang: "es",
    reviews: [review(2, "2026-10-01T00:00:00Z")],
    facts: null,
  };

  it("says the tips are for our app, drawn from the competitor's complaints, within our facts", () => {
    expect(REVIEW_PROMPT_VERSION).toBe("rv-6");
    expect(REVIEW_SYSTEM_PROMPT).toContain("listingTips are advice for OUR app's listing");
    expect(REVIEW_SYSTEM_PROMPT).toContain("Never give advice to the competitor");
    expect(REVIEW_SYSTEM_PROMPT).toMatch(/do not mention a trial, a subscription/);
    expect(REVIEW_SYSTEM_PROMPT).toContain("gratis y sin suscripción");
    const prompt = buildReviewPrompt({ ...input, ourFacts: "PRODUCT FACTS (test):\n- Sin anuncios", ourAppTitle: "Recordatorio" });
    expect(prompt).toContain("OUR APP (Recordatorio): the reviewed app is a competitor of ours. Every listingTip is for OUR listing");
    expect(prompt).toContain("never advice for Medisafe");
    expect(prompt).toContain("no trials, subscriptions or features they do not list");
    expect(prompt).toContain("- Sin anuncios");
  });

  it("marks the competitor even when we have no product facts", () => {
    const prompt = buildReviewPrompt({ ...input, ourFacts: null, ourAppTitle: "Recordatorio" });
    expect(prompt).toContain("OUR APP (Recordatorio)");
    expect(prompt).toContain("There are no PRODUCT FACTS for our app");
  });
});

describe("category asks", () => {
  const features = [
    { name: "Escáner de códigos de barras", summary: "Lee el código y muestra el producto" },
    { name: "Modo sin conexión", summary: "Funciona sin internet, también en el avión" },
  ];

  it("matches a need with a feature by its words, with a confidence", () => {
    expect(coveringFeature("Poder escanear el código de barras", features)).toEqual({ name: "Escáner de códigos de barras", confidence: "alta" });
    expect(coveringFeature("Que funcione sin conexión a internet en el avión", features)).toEqual({ name: "Modo sin conexión", confidence: "media" });
    expect(coveringFeature("Que funcione sin conexión", features)).toBeNull();
    expect(coveringFeature("Más temas de colores", features)).toBeNull();
  });

  // Real cases from the 2026-10-30 review (H17): one shared word is not a match.
  const shipped = product.features.filter((f) => f.status === "shipped");
  it("does not cover a need by one shared or very common word", () => {
    const withNames = [...shipped, { name: "Buscador de medicamentos CIMA", summary: "" }, { name: "Español e inglés", summary: "" }];
    expect(coveringFeature("Acceder a medicamentos ya usados al añadir tomas únicas y ver el historial de esas tomas", withNames)).toBeNull();
    expect(coveringFeature("Traducción incompleta, con partes en inglés, y fallos en la función de citas", withNames)).toBeNull();
  });

  it("still covers a need that shares several words with the feature", () => {
    const need = "Marcar como tomada, posponer u omitir desde la notificación";
    expect(coveringFeature(need, shipped)).toEqual({ name: "Responder desde la notificación", confidence: "media" });
    expect(coveringFeature(need, [{ name: "Tomar, posponer u omitir desde la notificación; deshacer", summary: "" }])).toMatchObject({ confidence: "alta" });
  });

  it("matches what no published feature covers with the next version (H18)", () => {
    const next = [
      { name: "Pautas flexibles de medicación", summary: "Intervalos cada X horas, días de la semana o «si lo necesito», con fecha de fin o indefinidos" },
    ];
    const [ask] = aggregateCategoryAsks(
      [{ targetTitle: "MyTherapy", result: analysis({ requests: ["Intervalos cada X horas que se mantengan indefinidamente"] }) }],
      shipped,
      next,
    );
    expect(ask.coveredBy).toBeNull();
    expect(ask.nextBy).toEqual({ name: "Pautas flexibles de medicación", confidence: "media" });
    // A published feature wins over the next version.
    const [both] = aggregateCategoryAsks(
      [{ targetTitle: "Rival", result: analysis({ requests: ["Escanear códigos de barras"] }) }],
      features,
      [{ name: "Escáner de códigos de barras mejorado", summary: "" }],
    );
    expect(both.coveredBy?.name).toBe("Escáner de códigos de barras");
    expect(both.nextBy).toBeNull();
  });

  it("merges the competitors' asks and splits covered from future features", () => {
    const asks = aggregateCategoryAsks(
      [
        { targetTitle: "Rival A", result: analysis({ requests: ["Escanear códigos de barras", "Exportar a Excel"], complaints: ["Demasiados anuncios"] }) },
        {
          targetTitle: "Rival B",
          result: analysis({
            requests: ["Exportar a Excel"],
            opportunities: [{ need: "No funciona sin wifi", feature: "Modo sin conexión", quote: "sin wifi no va" }],
          }),
        },
      ],
      features,
    );
    expect(asks[0]).toEqual({ text: "Exportar a Excel", kind: "request", apps: ["Rival A", "Rival B"], coveredBy: null, nextBy: null });
    expect(asks.find((a) => a.text === "Escanear códigos de barras")?.coveredBy).toEqual({ name: "Escáner de códigos de barras", confidence: "alta" });
    expect(asks.find((a) => a.text === "No funciona sin wifi")?.coveredBy).toEqual({ name: "Modo sin conexión", confidence: "ia" });
    expect(asks.find((a) => a.text === "Demasiados anuncios")).toMatchObject({ kind: "complaint", coveredBy: null });
    // Old analyses without opportunities still aggregate.
    const old: ReviewAnalysis = { ...analysis({ requests: ["Modo oscuro"] }), opportunities: undefined };
    expect(aggregateCategoryAsks([{ targetTitle: "Rival C", result: old }], [])).toHaveLength(1);
  });
});

describe("review targets from the TOP 5", () => {
  const app = (id: string, title = id) => ({ store: "android" as const, id, title, developer: "", icon: "", rating: null, url: "" });
  const snapshots = [
    { keywordId: 1, date: "2026-10-01", top5: [app("rival", "Rival viejo"), app("own")] },
    { keywordId: 1, date: "2026-10-20", top5: [app("own"), app("rival", "Rival"), app("other")] },
    { keywordId: 2, date: "2026-10-20", top5: [app("rival", "Rival"), app("other")] },
  ];

  it("finds an app in any stored TOP 5, newest title first", () => {
    expect(findInTop5(snapshots, "rival")?.title).toBe("Rival");
    expect(findInTop5(snapshots, "nobody")).toBeNull();
  });

  it("suggests the strongest other apps by visibility share", () => {
    const top = topCompetitors(snapshots, new Map(), "own", 3);
    expect(top.map((r) => r.app.id)).toEqual(["rival", "other"]);
  });
});

describe("next-version opportunities from the AI (H18 with the real fixture)", () => {
  const features = product.features as ProductFeature[];
  const published = featuresFor(features, "published");
  const next = featuresFor(features, "next").filter((f) => f.status === "next_release");
  const need = "Intervalos cada X horas que se mantengan indefinidamente";

  it("word matching alone cannot place it (the reason the AI decides)", () => {
    expect(coveringFeature(need, next)).toBeNull();
    expect(coveringFeature("Exportar o borrar los datos", published)).toBeNull();
  });

  it("shows an AI opportunity with status next under the next version", () => {
    const result = analysis({
      requests: [need],
      opportunities: [{ need, feature: "Pautas flexibles", quote: "quiero cada 8 horas sin fecha de fin", status: "next" }],
    });
    const asks = aggregateCategoryAsks([{ targetTitle: "MyTherapy", result }], published, next);
    expect(asks).toHaveLength(1);
    const [ask] = asks;
    expect(ask.coveredBy).toBeNull();
    expect(ask.nextBy).toEqual({ name: "Pautas flexibles", confidence: "ia" });
    expect(ask.kind).toBe("request");
    // The page's "Lo resuelve la próxima versión" column: not covered, nextBy set.
    expect(asks.filter((a) => !a.coveredBy && a.nextBy)).toHaveLength(1);
  });

  it("keeps old opportunities without status as published", () => {
    const old = analysis({ opportunities: [{ need: "Alarmas que fallan", feature: "Alarmas exactas", quote: "no suena" }] as ReviewAnalysis["opportunities"] });
    const [ask] = aggregateCategoryAsks([{ targetTitle: "Rival", result: old }], published, next);
    expect(ask.coveredBy).toEqual({ name: "Alarmas exactas", confidence: "ia" });
    expect(ask.nextBy).toBeNull();
  });

  it("gives the model the next version apart, in its own section, and fixes its status by the feature list", () => {
    const prompt = ourFactsForReviews(null, features)!;
    expect(prompt).toContain("Features available in the published version:");
    expect(prompt).toContain("OUR NEXT VERSION");
    expect(prompt).toMatch(/^- Pautas flexibles: Pautas por días de la semana, todos los días, cada X horas y «si lo necesito»$/m);
    // No marker after the name: the model would copy it into `feature`.
    expect(prompt).not.toContain("(next version)");
    expect(prompt.indexOf("- Pautas flexibles")).toBeGreaterThan(prompt.indexOf("OUR NEXT VERSION"));
    expect(prompt).not.toContain("- Modo cuidador");
    expect(REVIEW_SYSTEM_PROMPT).toContain('status is "published"');
    const fixed = fixOpportunityStatus(
      [
        { need, feature: "Pautas flexibles", quote: "q", status: "published" as const },
        { need: "Ver el stock", feature: "Control de stock", quote: "q", status: "next" as const },
        { need: "Cuidar a mi madre", feature: "Modo cuidador", quote: "q", status: "next" as const },
      ],
      features,
    );
    expect(fixed.map((o) => [o.feature, o.status])).toEqual([
      ["Pautas flexibles", "next"],
      ["Control de stock", "published"],
    ]);
  });
});

describe("fixOpportunityStatus: names as the model writes them", () => {
  const op = (feature: string, status: "published" | "next" = "published") => ({ need: "n", feature, quote: "q", status });

  it("matches a name with a copied marker, quotes or trailing punctuation", () => {
    expect(featureKey("«Pautas flexibles» (next version).")).toBe("pautas flexibles");
    expect(featureKey('"Control de stock"')).toBe("control de stock");
    expect(featureKey("Modo cuidador (próxima versión) (beta)")).toBe("modo cuidador");
    const features = [
      { name: "Pautas flexibles", status: "next_release" as const },
      { name: "Control de stock", status: "shipped" as const },
      { name: "Modo cuidador", status: "planned" as const },
    ];
    const fixed = fixOpportunityStatus([op("Pautas flexibles (next version)"), op('"Control de stock".', "next"), op("«Modo cuidador»")], features);
    expect(fixed.map((o) => [o.feature, o.status])).toEqual([
      ["Pautas flexibles (next version)", "next"],
      ['"Control de stock".', "published"],
    ]);
  });

  it("on a name shared by two features, the one that solves something wins", () => {
    const features = [
      { name: "Alarmas", status: "shipped" as const },
      { name: "alarmas", status: "retired" as const },
      { name: "Widget", status: "planned" as const },
      { name: "Widget.", status: "next_release" as const },
    ];
    expect(fixOpportunityStatus([op("Alarmas", "next"), op("Widget")], features).map((o) => o.status)).toEqual(["published", "next"]);
  });
});

// Review: the status is checked at save time only; stored analyses must follow features shipped or retired later.
describe("withCurrentOpportunityStatus: stored analyses read against today's features", () => {
  const stored = (opportunities: ReviewAnalysis["opportunities"]) => ({
    targetTitle: "Medisafe",
    result: { ...EMPTY_REVIEW_ANALYSIS, opportunities },
  });

  it("moves a shipped feature to published, drops a retired one and leaves old analyses alone", () => {
    const before = stored([
      { need: "Pautas por días", feature: "Pautas flexibles", quote: "q", status: "next" },
      { need: "Ver el stock", feature: "Control de stock", quote: "q", status: "published" },
      { need: "Otra", feature: "Desconocida", quote: "q", status: "next" },
    ]);
    const features = [
      { name: "Pautas flexibles", status: "shipped" as const },
      { name: "Control de stock", status: "retired" as const },
    ];
    const [after] = withCurrentOpportunityStatus([before], features);
    // «Desconocida» is no feature of today's list (deleted from the product sheet): it solves nothing.
    expect(after.result.opportunities?.map((o) => [o.feature, o.status])).toEqual([["Pautas flexibles", "published"]]);
    expect(after.targetTitle).toBe("Medisafe");
    // The stored row is not mutated.
    expect(before.result.opportunities?.[0].status).toBe("next");
    // Before rv-5 there were no opportunities: still undefined, so the page can say so.
    const old = { targetTitle: "Old", result: { ...EMPTY_REVIEW_ANALYSIS, opportunities: undefined } };
    expect(withCurrentOpportunityStatus([old], features)[0].result.opportunities).toBeUndefined();
    // Aggregated: the shipped feature now covers the ask, the retired one no longer does.
    const asks = aggregateCategoryAsks(withCurrentOpportunityStatus([before], features), [], []);
    expect(asks.find((a) => a.text === "Pautas por días")?.coveredBy).toMatchObject({ name: "Pautas flexibles" });
    expect(asks.find((a) => a.text === "Ver el stock")).toBeUndefined();
  });

  // Review 2026-10-30: a feature deleted (not retired) from the product sheet kept the model's status.
  it("drops an opportunity whose feature was deleted, but keeps the model's status without a feature list", () => {
    const before = stored([
      { need: "Pautas por días", feature: "Pautas flexibles", quote: "q", status: "published" },
      { need: "Avisar a mi hija", feature: "Modo familiar", quote: "q", status: "published" },
    ]);
    const [after] = withCurrentOpportunityStatus([before], [{ name: "Pautas flexibles", status: "shipped" as const }]);
    expect(after.result.opportunities?.map((o) => o.feature)).toEqual(["Pautas flexibles"]);
    // No features known (empty product sheet): nothing to check against.
    const [unknown] = withCurrentOpportunityStatus([before], []);
    expect(unknown.result.opportunities?.map((o) => [o.feature, o.status])).toEqual([
      ["Pautas flexibles", "published"],
      ["Modo familiar", "published"],
    ]);
  });
});
