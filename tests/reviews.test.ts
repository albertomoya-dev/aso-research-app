import { describe, expect, it } from "vitest";
import { buildReviewPrompt, ratingStats } from "@/lib/review-analysis";
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
