import { describe, expect, it } from "vitest";
import {
  aggregateCategoryAsks,
  buildReviewPrompt,
  coveringFeature,
  EMPTY_REVIEW_ANALYSIS,
  ratingStats,
  reviewAnalysisSchema,
  storedReviewAnalysisSchema,
  type ReviewAnalysis,
} from "@/lib/review-analysis";
import { findInTop5, topCompetitors } from "@/lib/review-queries";
import { toReview } from "@/lib/stores/android";
import { parseReviewFeed } from "@/lib/stores/ios";
import type { Review } from "@/lib/stores/types";

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
    const withOpportunities = { ...old, opportunities: [{ need: "Escanear códigos", feature: "Escáner", quote: "ojalá escaneara" }] };
    expect(reviewAnalysisSchema.parse(withOpportunities).opportunities).toHaveLength(1);
    expect(storedReviewAnalysisSchema.parse(withOpportunities).opportunities).toHaveLength(1);
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
    expect(prompt).toContain("OUR APP (the reviewed app is a competitor");
    expect(prompt).toContain("- Escáner de códigos de barras");
    expect(prompt.indexOf("OUR APP")).toBeLessThan(prompt.indexOf("most recent reviews"));
    expect(buildReviewPrompt({ appTitle: "Runly", storeName: "App Store", countryName: "España", lang: "es", reviews: [], facts: null })).not.toContain(
      "OUR APP",
    );
  });
});

describe("category asks", () => {
  const features = [
    { name: "Escáner de códigos de barras", summary: "Lee el código y muestra el producto" },
    { name: "Modo sin conexión", summary: "Funciona sin internet" },
  ];

  it("matches a need with a feature by its words", () => {
    expect(coveringFeature("Poder escanear el código de barras", features)).toBe("Escáner de códigos de barras");
    expect(coveringFeature("Que funcione sin conexión en el avión", features)).toBe("Modo sin conexión");
    expect(coveringFeature("Más temas de colores", features)).toBeNull();
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
    expect(asks[0]).toEqual({ text: "Exportar a Excel", kind: "request", apps: ["Rival A", "Rival B"], coveredBy: null });
    expect(asks.find((a) => a.text === "Escanear códigos de barras")?.coveredBy).toBe("Escáner de códigos de barras");
    expect(asks.find((a) => a.text === "No funciona sin wifi")?.coveredBy).toBe("Modo sin conexión");
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
