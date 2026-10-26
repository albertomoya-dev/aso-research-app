import { describe, expect, it } from "vitest";
import { diffListings, type Listing } from "@/lib/listing-diff";
import type { AppSummary } from "@/lib/stores/types";
import { latestPerKeyword, shareByDay, visibilityShare } from "@/lib/visibility";

const listing = (l: Partial<Listing> = {}): Listing => ({
  title: "Runly: Correr",
  shortDescription: "Entrena para tu primera carrera",
  description: "Planes de entrenamiento para correr.",
  version: "1.0",
  releaseNotes: "Mejoras",
  icon: "https://is1-ssl.mzstatic.com/image/thumb/abc/512x512bb.jpg",
  screenshots: ["https://x/1/392x696bb.jpg", "https://x/2/392x696bb.jpg"],
  price: "Gratis",
  category: "Salud",
  ...l,
});

describe("diffListings", () => {
  it("finds nothing when only release notes or the icon size change", () => {
    expect(
      diffListings(listing(), listing({ releaseNotes: "Otra cosa", icon: "https://is1-ssl.mzstatic.com/image/thumb/abc/100x100bb.jpg" })),
    ).toEqual([]);
  });

  it("reports text changes with added and removed words", () => {
    const [change] = diffListings(listing(), listing({ title: "Runly: Correr y Caminar" }));
    expect(change).toMatchObject({ field: "title", kind: "text", added: ["caminar"], removed: [] });
  });

  it("reports value, icon and screenshot changes", () => {
    const changes = diffListings(
      listing(),
      listing({ version: "1.1", icon: "https://is1-ssl.mzstatic.com/image/thumb/new/512x512bb.jpg", screenshots: ["https://x/3/392x696bb.jpg"] }),
    );
    expect(changes.map((c) => c.field)).toEqual(["version", "icon", "screenshots"]);
    expect(changes[2]).toMatchObject({ before: 2, after: 1 });
  });
});

const app = (id: string): AppSummary => ({ store: "ios", id, title: id, developer: "d", icon: "i", rating: null, url: "u" });

describe("visibilityShare", () => {
  it("splits each keyword by position weight and popularity", () => {
    const rows = visibilityShare(
      [
        { keywordId: 1, date: "2026-10-01", top5: [app("a"), app("b")] },
        { keywordId: 2, date: "2026-10-01", top5: [app("b"), app("a")] },
      ],
      new Map([
        [1, 30],
        [2, 10],
      ]),
    );
    // a: 30·0.4 + 10·0.22 = 14.2; b: 30·0.22 + 10·0.4 = 10.6.
    expect(rows.map((r) => r.app.id)).toEqual(["a", "b"]);
    expect(rows[0].share).toBeCloseTo((100 * 14.2) / 24.8);
    expect(rows[0]).toMatchObject({ keywords: 2, bestPosition: 1 });
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100);
  });

  it("counts keywords without popularity as 1", () => {
    const rows = visibilityShare([{ keywordId: 1, date: "d", top5: [app("a")] }], new Map());
    expect(rows[0].share).toBe(100);
  });

  it("keeps the latest snapshot per keyword and builds a daily series", () => {
    const snaps = [
      { keywordId: 1, date: "2026-10-01", top5: [app("a"), app("b")] },
      { keywordId: 1, date: "2026-10-02", top5: [app("b"), app("a")] },
    ];
    expect(latestPerKeyword(snaps).map((s) => s.date)).toEqual(["2026-10-02"]);
    const series = shareByDay(snaps, new Map(), ["a", "c"]);
    expect(series).toEqual([
      { date: "2026-10-01", a: 64.5, c: 0 },
      { date: "2026-10-02", a: 35.5, c: 0 },
    ]);
  });
});
