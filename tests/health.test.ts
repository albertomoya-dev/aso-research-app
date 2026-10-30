import { describe, expect, it } from "vitest";
import {
  compareVersions,
  COVERAGE_GOOD,
  COVERAGE_WARN,
  coverageItem,
  healthSummary,
  irrelevantItem,
  listingAgeItem,
  nextSeason,
  policyItem,
  REVIEWS_BAD,
  reviewsItem,
  screenshotsItem,
  seasonItem,
} from "@/lib/health";

const href = "/apps/1/metadata";

describe("coverageItem", () => {
  it("grades the weighted score with the thresholds", () => {
    expect(coverageItem({ score: COVERAGE_GOOD, source: "published", keywords: 10, href }).status).toBe("good");
    expect(coverageItem({ score: COVERAGE_GOOD - 0.6, source: "published", keywords: 10, href }).status).toBe("warn");
    expect(coverageItem({ score: COVERAGE_WARN, source: "draft", keywords: 10, href }).status).toBe("warn");
    expect(coverageItem({ score: COVERAGE_WARN - 1, source: "draft", keywords: 10, href }).status).toBe("bad");
  });

  it("says which listing it measured and links to the editor", () => {
    const item = coverageItem({ score: 42.4, source: "draft", keywords: 10, href });
    expect(item.value).toBe("42/100");
    expect(item.hint).toContain("Tu borrador");
    expect(item.href).toBe(href);
  });

  it("is unknown without relevant keywords", () => {
    expect(coverageItem({ score: null, source: "published", keywords: 0, href }).status).toBe("unknown");
  });
});

describe("irrelevantItem", () => {
  const base = { budget: 150, href: "/apps/1?f=noise" };
  it("is good with nothing to clean and no link", () => {
    expect(irrelevantItem({ ...base, irrelevant: 0, total: 40 })).toMatchObject({ status: "good", href: null });
  });
  it("warns with a few, is bad with many or over the budget", () => {
    expect(irrelevantItem({ ...base, irrelevant: 3, total: 40 })).toMatchObject({ status: "warn", value: "3", href: base.href });
    expect(irrelevantItem({ ...base, irrelevant: 20, total: 60 }).status).toBe("bad");
    const over = irrelevantItem({ ...base, irrelevant: 0, total: 151 });
    expect(over.status).toBe("bad");
    expect(over.hint).toContain("por encima de 150");
  });
  it("is unknown without keywords", () => {
    expect(irrelevantItem({ ...base, irrelevant: 0, total: 0 }).status).toBe("unknown");
  });
});

describe("compareVersions", () => {
  it("compares numerically, part by part", () => {
    expect(compareVersions("1.10", "1.9")).toBe(1);
    expect(compareVersions("2.0", "2.0.0")).toBe(0);
    expect(compareVersions("1.2.3", "1.3")).toBe(-1);
  });
});

describe("listingAgeItem", () => {
  const base = { productHref: "/apps/1/producto", editorHref: href, nextFeatures: 0, hasProduct: true };
  it("is bad when the product has a newer version than the store", () => {
    const item = listingAgeItem({ ...base, published: { version: "2.1", updatedAt: "2026-09-01" }, latestRelease: { version: "2.2", date: "2026-10-20" } });
    expect(item.status).toBe("bad");
    expect(item.hint).toContain("Tu ficha describe una versión anterior");
    expect(item.href).toBe(href);
  });
  it("falls back to dates when the store has no version", () => {
    expect(listingAgeItem({ ...base, published: { version: null, updatedAt: "2026-09-01" }, latestRelease: { version: "3", date: "2026-10-20" } }).status).toBe("bad");
    expect(listingAgeItem({ ...base, published: { version: null, updatedAt: "2026-10-25" }, latestRelease: { version: "3", date: "2026-10-20" } }).status).toBe("good");
  });
  it("is good when the store already has the latest version, even if the release date is later", () => {
    expect(listingAgeItem({ ...base, published: { version: "2.2", updatedAt: "2026-09-01" }, latestRelease: { version: "2.2", date: "2026-10-20" } }).status).toBe("good");
  });
  it("warns about features planned for the next release", () => {
    const item = listingAgeItem({ ...base, nextFeatures: 2, published: { version: "2.2", updatedAt: null }, latestRelease: { version: "2.2", date: null } });
    expect(item).toMatchObject({ status: "warn", value: "2 novedades" });
  });
  it("is unknown without a product sheet or without releases", () => {
    expect(listingAgeItem({ ...base, hasProduct: false, published: { version: "1", updatedAt: null }, latestRelease: null })).toMatchObject({
      status: "unknown",
      href: "/apps/1/producto",
    });
    expect(listingAgeItem({ ...base, published: { version: "1", updatedAt: null }, latestRelease: null }).status).toBe("unknown");
  });
});

describe("screenshotsItem", () => {
  const h = "/apps/1/creativos";
  it("is unknown without uploaded screenshots", () => {
    expect(screenshotsItem({ stale: 0, uploaded: 0, hasDesign: true, href: h }).status).toBe("unknown");
    expect(screenshotsItem({ stale: 0, uploaded: 0, hasDesign: false, href: h }).status).toBe("unknown");
  });
  it("is good, warn or bad by how many are stale", () => {
    expect(screenshotsItem({ stale: 0, uploaded: 5, hasDesign: true, href: h }).status).toBe("good");
    expect(screenshotsItem({ stale: 2, uploaded: 5, hasDesign: true, href: h })).toMatchObject({ status: "warn", value: "2 de 5" });
    expect(screenshotsItem({ stale: 5, uploaded: 5, hasDesign: true, href: h }).status).toBe("bad");
  });
});

describe("policyItem", () => {
  it("is bad with errors, warn with warnings only, good otherwise", () => {
    expect(policyItem({ issues: [{ level: "error", text: "x" }, { level: "warn", text: "y" }], source: "published", href }).status).toBe("bad");
    expect(policyItem({ issues: [{ level: "warn", text: "y" }, { level: "info", text: "z" }], source: "draft", href })).toMatchObject({
      status: "warn",
      value: "1 aviso",
    });
    expect(policyItem({ issues: [{ level: "info", text: "z" }], source: "draft", href })).toMatchObject({ status: "good", href: null });
  });
});

describe("reviewsItem", () => {
  const h = "/apps/1/resenas";
  it("is unknown for App Store and without Play Console, pointing to Ajustes", () => {
    expect(reviewsItem({ store: "ios", configured: false, unanswered: null, reviewsHref: h }).status).toBe("unknown");
    expect(reviewsItem({ store: "android", configured: false, unanswered: null, reviewsHref: h })).toMatchObject({ status: "unknown", href: "/ajustes" });
  });
  it("shows the error when Google fails", () => {
    expect(reviewsItem({ store: "android", configured: true, unanswered: null, error: "Sin permiso.", reviewsHref: h }).hint).toContain("Sin permiso.");
  });
  it("grades the unanswered count", () => {
    expect(reviewsItem({ store: "android", configured: true, unanswered: 0, total: 4, reviewsHref: h }).status).toBe("good");
    expect(reviewsItem({ store: "android", configured: true, unanswered: 3, reviewsHref: h })).toMatchObject({ status: "warn", href: h });
    expect(reviewsItem({ store: "android", configured: true, unanswered: REVIEWS_BAD, reviewsHref: h }).status).toBe("bad");
  });
});

describe("nextSeason and seasonItem", () => {
  it("finds the nearest peak start across keywords, wrapping the year", () => {
    // 30 Oct: «navidad» starts 1 Dec (32 days), «verano» 1 Jun next year.
    const next = nextSeason([{ term: "verano", peaks: [5, 6] }, { term: "navidad", peaks: [11, 0] }], "2026-10-30");
    expect(next).toEqual({ term: "navidad", month: 11, days: 32, running: false });
    expect(nextSeason([{ term: "enero", peaks: [0] }], "2026-10-30")).toMatchObject({ month: 0, days: 63 });
  });

  it("counts a running peak as now", () => {
    expect(nextSeason([{ term: "halloween", peaks: [9] }], "2026-10-30")).toEqual({ term: "halloween", month: 9, days: 0, running: true });
  });

  it("returns null without peaks", () => {
    expect(nextSeason([{ term: "x", peaks: [] }], "2026-10-30")).toBeNull();
  });

  it("warns when the peak is close and is unknown without data", () => {
    const h = "/apps/1/estacionalidad";
    expect(seasonItem({ next: { term: "navidad", month: 11, days: 32, running: false }, analysed: 5, href: h })).toMatchObject({
      status: "warn",
      value: "Diciembre, en 32 días",
    });
    expect(seasonItem({ next: { term: "verano", month: 5, days: 214, running: false }, analysed: 5, href: h }).status).toBe("good");
    expect(seasonItem({ next: null, analysed: 0, href: h }).status).toBe("unknown");
  });
});

describe("healthSummary", () => {
  it("counts the items per status", () => {
    const items = [
      coverageItem({ score: 80, source: "published", keywords: 3, href }),
      coverageItem({ score: 10, source: "published", keywords: 3, href }),
      reviewsItem({ store: "ios", configured: false, unanswered: null, reviewsHref: "" }),
    ];
    expect(healthSummary(items)).toEqual({ good: 1, warn: 0, bad: 1, unknown: 1 });
  });
});
