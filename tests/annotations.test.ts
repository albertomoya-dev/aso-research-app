import { describe, expect, it } from "vitest";
import { affectedKeywords, changedWords, listingAnnotation, MAX_ANNOTATION_LABEL, publishAnnotation } from "@/lib/annotations";
import { experimentInputSchema } from "@/lib/experiments";
import { annotationImpact, summarizeImpacts } from "@/lib/impact";
import { diffListings, type Listing } from "@/lib/listing-diff";
import { changesNotPublished } from "@/lib/own-listings";
import { snapshotWindows } from "@/lib/annotation-queries";
import { shiftDate } from "@/lib/ranking";

const v2: Listing = {
  title: "Recordatorio de pastillas",
  shortDescription: "Avisos para tomar tus medicinas",
  description: "Recordatorio de pastillas con alarmas.",
  version: "2.4",
  releaseNotes: null,
  icon: "https://play-lh.googleusercontent.com/abc=w240-h480",
  screenshots: ["https://x/1.png", "https://x/2.png"],
  price: "Gratis",
  category: "Medicina",
};

describe("listingAnnotation", () => {
  it("names the changed fields and the new version", () => {
    const next = { ...v2, title: "Pastillas: recordatorio y toma", description: "Escanea el código de barras.", version: "3.0" };
    const note = listingAnnotation(diffListings(v2, next))!;
    expect(note.label).toBe("Ficha: título y descripción cambiaron (v3.0)");
    expect(note.detail.kind).toBe("listing");
    expect(note.detail.version).toBe("3.0");
    const title = note.detail.changes.find((c) => c.field === "title")!;
    expect(title.added).toEqual(["toma"]);
    expect(title.removed).toEqual(["de"]);
    // Full texts are not copied: the snapshot keeps them.
    expect(title).not.toHaveProperty("before");
  });

  it("reads a version bump alone as a new version", () => {
    expect(listingAnnotation(diffListings(v2, { ...v2, version: "2.5" }))!.label).toBe("Nueva versión 2.5");
  });

  it("uses the singular verb for one field and lists icon and screenshots", () => {
    expect(listingAnnotation(diffListings(v2, { ...v2, shortDescription: "Otra" }))!.label).toBe("Ficha: descripción corta cambió");
    const next = { ...v2, icon: "https://play-lh.googleusercontent.com/new=w240-h480", screenshots: ["https://x/3.png"] };
    expect(listingAnnotation(diffListings(v2, next))!.label).toBe("Ficha: icono y capturas cambiaron");
  });

  it("returns null when nothing changed, so the first run only stores the baseline", () => {
    expect(listingAnnotation([])).toBeNull();
    expect(listingAnnotation(diffListings(v2, { ...v2, icon: "https://play-lh.googleusercontent.com/abc=w512-h1024" }))).toBeNull();
  });

  it("keeps labels within the manual form limit", () => {
    const changes = diffListings(v2, { ...v2, title: "a", shortDescription: "b", description: "c", price: "1 €", category: "Salud", icon: "https://y/i.png", screenshots: [], version: "10.0.0-beta.1234567890" });
    expect(listingAnnotation(changes)!.label.length).toBeLessThanOrEqual(MAX_ANNOTATION_LABEL);
  });
});

describe("publishAnnotation", () => {
  const fields = [{ field: "shortDescription" as const, label: "Descripción corta", before: "Avisos de pastillas", after: "Avisos de medicamentos" }];

  it("labels a successful publication and diffs its words", () => {
    const note = publishAnnotation({ store: "android", locale: "es-ES", status: "committed", fields })!;
    expect(note.label).toBe("Enviado a Google Play (es-ES): descripción corta");
    expect(note.detail.changes[0]).toMatchObject({ added: ["medicamentos"], removed: ["pastillas"] });
  });

  it("skips failed publications and empty ones", () => {
    expect(publishAnnotation({ store: "ios", locale: "es-ES", status: "failed", fields })).toBeNull();
    expect(publishAnnotation({ store: "ios", locale: "es-ES", status: "saved", fields: [] })).toBeNull();
  });
});

describe("affectedKeywords", () => {
  const keywords = [
    { id: 1, term: "recordatorio medicación" },
    { id: 2, term: "pastillero" },
    { id: 3, term: "código de barras medicamentos" },
  ];

  it("keeps the keywords that contain a word added or removed, ignoring accents", () => {
    const detail = { kind: "listing" as const, changes: [{ field: "description", label: "Descripción", added: ["medicacion", "código"], removed: [] }] };
    expect(changedWords(detail).has("codigo")).toBe(true);
    expect(affectedKeywords(keywords, detail).map((k) => k.id)).toEqual([1, 3]);
  });

  it("returns none for changes without words (icon, version, manual notes)", () => {
    expect(affectedKeywords(keywords, null)).toEqual([]);
    expect(affectedKeywords(keywords, { kind: "listing", changes: [{ field: "icon", label: "Icono", before: "a", after: "b" }] })).toEqual([]);
  });
});

describe("annotationImpact", () => {
  const date = "2026-10-01";
  const series = (from: number, to: number, position: (i: number) => number | null) =>
    Array.from({ length: to - from + 1 }, (_, k) => ({ date: shiftDate(date, from + k), position: position(from + k) }));

  it("compares the 14 days before and after, leaving the day itself out", () => {
    const history = [...series(-14, -1, () => 20), { date, position: 1 }, ...series(1, 14, () => 10)];
    const impact = annotationImpact(history, date, { today: "2026-11-01" });
    expect(impact.before).toEqual({ mean: 20, ranked: 14, outside: 0, unchecked: 0 });
    expect(impact.after.mean).toBe(10);
    expect(impact.change).toBe(10);
    expect(impact.verdict).toBe("up");
    expect(impact.complete).toBe(true);
  });

  it("does not count days outside the results as a position, and reports them apart", () => {
    const history = [...series(-14, -1, (i) => (i % 2 ? null : 30)), ...series(1, 7, () => 40)];
    const impact = annotationImpact(history, date, { today: "2026-11-01" });
    expect(impact.before).toMatchObject({ mean: 30, ranked: 7, outside: 7, unchecked: 0 });
    expect(impact.after).toMatchObject({ ranked: 7, outside: 0, unchecked: 7 });
    expect(impact.verdict).toBe("down");
  });

  it("says «entered» or «left» when one side has no position at all", () => {
    expect(annotationImpact([...series(-5, -1, () => null), ...series(1, 3, () => 25)], date, { today: "2026-11-01" }).verdict).toBe("entered");
    expect(annotationImpact([...series(-5, -1, () => 25), ...series(1, 3, () => null)], date, { today: "2026-11-01" }).verdict).toBe("left");
    expect(annotationImpact([], date, { today: "2026-11-01" }).verdict).toBe("unknown");
  });

  it("is incomplete while the window after is running and does not count future days as unchecked", () => {
    const impact = annotationImpact([...series(-3, -1, () => 5), ...series(1, 3, () => 5.4)], date, { today: shiftDate(date, 3) });
    expect(impact.complete).toBe(false);
    expect(impact.after.unchecked).toBe(0);
    expect(impact.verdict).toBe("flat");
  });

  it("counts verdicts", () => {
    const up = annotationImpact([...series(-1, -1, () => 9), ...series(1, 1, () => 3)], date, { today: "2026-11-01" });
    expect(summarizeImpacts([up, up]).up).toBe(2);
  });
});

describe("experimentInputSchema", () => {
  it("accepts a minimal plan and stores empty dates as null", () => {
    const e = experimentInputSchema.parse({ name: " Icono verde ", startDate: "", endDate: "" });
    expect(e).toMatchObject({ name: "Icono verde", status: "planned", startDate: null, endDate: null, hypothesis: "" });
  });

  it("rejects an end before the start and an empty name", () => {
    const bad = experimentInputSchema.safeParse({ name: "x", startDate: "2026-10-10", endDate: "2026-10-01" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toMatch(/fin/);
    expect(experimentInputSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(experimentInputSchema.safeParse({ name: "x", status: "won" }).success).toBe(false);
  });
});

describe("changesNotPublished", () => {
  const v3: Listing = { ...v2, title: "Pastillas: recordatorio y alarma", description: "Nuevo texto con alarmas.", version: "3.0" };
  const changes = diffListings(v2, v3);
  const now = new Date("2026-10-30T10:00:00Z");
  const pub = (over: Partial<Parameters<typeof changesNotPublished>[1][number]> = {}) => ({
    status: "committed" as const,
    locale: "es-ES",
    fields: [{ field: "title" as const, label: "Título", before: v2.title, after: v3.title }],
    publishedAt: new Date("2026-10-25T10:00:00Z"),
    ...over,
  });

  it("drops the text changes a recent publication already explains", () => {
    const left = changesNotPublished(changes, [pub()], "es", now).map((c) => c.field);
    expect(left).not.toContain("title");
    expect(left).toContain("description");
    expect(left).toContain("version");
    // Google Play's fullDescription is the listing description: nothing but the version is left.
    const both = pub({ fields: [...pub().fields, { field: "fullDescription", label: "Descripción", before: "", after: "" }] });
    expect(changesNotPublished(changes, [both], "es", now).map((c) => c.field)).toEqual(["version"]);
    expect(listingAnnotation(changesNotPublished(changes, [both], "es", now))!.label).toBe("Nueva versión 3.0");
  });

  it("keeps everything for failed, old or other-language publications", () => {
    const all = changes.map((c) => c.field);
    expect(changesNotPublished(changes, [pub({ status: "failed" })], "es", now).map((c) => c.field)).toEqual(all);
    expect(changesNotPublished(changes, [pub({ publishedAt: new Date("2026-10-10T10:00:00Z") })], "es", now).map((c) => c.field)).toEqual(all);
    expect(changesNotPublished(changes, [pub({ locale: "en-US" })], "es", now).map((c) => c.field)).toEqual(all);
  });

  it("leaves nothing to annotate when the publication covers every change", () => {
    const titleOnly = diffListings(v2, { ...v2, title: v3.title });
    expect(listingAnnotation(changesNotPublished(titleOnly, [pub()], "es", now))).toBeNull();
  });
});

describe("snapshotWindows", () => {
  it("reads only the days around each annotation, merging the ones that overlap", () => {
    const windows = snapshotWindows([
      { date: "2026-10-20", keywordIds: null },
      { date: "2026-10-01", keywordIds: null },
      { date: "2026-10-10", keywordIds: null },
      { date: "2026-06-01", keywordIds: [3, 1] },
      { date: "2026-06-10", keywordIds: [2] },
      { date: "2026-03-01", keywordIds: [] },
    ]);
    expect(windows).toEqual([
      { from: "2026-09-17", to: "2026-11-03", keywordIds: null },
      { from: "2026-05-18", to: "2026-06-24", keywordIds: [1, 2, 3] },
    ]);
    expect(snapshotWindows([{ date: "2026-01-31", keywordIds: null }, { date: "2026-03-31", keywordIds: null }], 14)).toHaveLength(2);
  });
});
