import { describe, expect, it } from "vitest";
import {
  ACTIVITY_ANNOTATION_SOURCES,
  ACTIVITY_TYPES,
  activityDays,
  annotationSourcesForType,
  annotationSummary,
  kindsForType,
  parseActivityFilters,
} from "@/lib/activity";
import { alertPriority } from "@/lib/alerts";

// Actividad's «Tipo» filter (REDISENO §6.12): Posición, Competidor, Temporada and Ficha.

describe("activity types", () => {
  it("are Posición, Competidor, Temporada and Ficha («Alerta» has no kind of its own)", () => {
    expect(ACTIVITY_TYPES.map((t) => t.label)).toEqual(["Posición", "Competidor", "Temporada", "Ficha"]);
    expect(parseActivityFilters({ tipo: "ficha" }).type).toBe("ficha");
    expect(parseActivityFilters({ tipo: "alerta" }).type).toBeNull();
  });

  it("«Ficha» shows the automatic and publish annotations and no alert", () => {
    expect(kindsForType("ficha")).toEqual([]);
    expect(annotationSourcesForType("ficha")).toEqual(["auto", "publish"]);
    // Manual notes are not activity.
    expect(ACTIVITY_ANNOTATION_SOURCES).not.toContain("manual");
  });

  it("«Todo» shows the annotations too; the alert types do not", () => {
    expect(annotationSourcesForType(null)).toEqual(["auto", "publish"]);
    for (const type of ["posicion", "competidor", "temporada"]) expect(annotationSourcesForType(type), type).toEqual([]);
  });
});

describe("activityDays", () => {
  const alert = (id: number, date: string, kind: "entered_top10" | "moved_up" | "seasonal_peak" | "competitor_change") => ({ id, date, kind, tone: "up" as const });
  const note = (id: number, date: string) => ({ id, date, source: "auto" as const });

  it("groups alerts and annotations by day, newest day first, our app's events first", () => {
    const days = activityDays(
      [alert(1, "2026-11-03", "competitor_change"), alert(2, "2026-11-03", "entered_top10"), alert(3, "2026-11-02", "seasonal_peak")],
      [note(10, "2026-11-03"), note(11, "2026-11-04")],
      alertPriority,
    );
    expect(days.map(([d]) => d)).toEqual(["2026-11-04", "2026-11-03", "2026-11-02"]);
    const ids = days[1][1].map((e) => (e.type === "alert" ? `a${e.alert.id}` : `n${e.annotation.id}`));
    // TOP 10 (0), then the listing change (with our own moves), then the competitor (4).
    expect(ids).toEqual(["a2", "n10", "a1"]);
  });

  it("is empty with nothing to show", () => {
    expect(activityDays([], [], alertPriority)).toEqual([]);
  });
});

describe("annotationSummary", () => {
  it("names the fields that changed, or the kind of change", () => {
    expect(annotationSummary("auto", { changes: [{ label: "Título" }, { label: "Descripción corta" }] })).toBe("Cambio visto en la tienda: título, descripción corta");
    expect(annotationSummary("publish", { changes: [] })).toBe("Publicado desde Rankeo");
    expect(annotationSummary("auto", null)).toBe("Cambio visto en la tienda");
  });
});
