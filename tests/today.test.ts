import { describe, expect, it } from "vitest";
import type { HealthItem, NextSeason } from "@/lib/health";
import { firstSentence, type TodayAlert, whatToDoToday } from "@/lib/today";

const es = { id: 1, productSlug: "recordatorio", title: "Recordatorio", country: "es" };
const us = { id: 4, productSlug: "recordatorio", title: "Recordatorio", country: "us" };
const other = { id: 2, productSlug: "lockgen", title: "LockGen", country: "es" };

const health = (id: HealthItem["id"], status: HealthItem["status"], hint = `${id}: algo pasa. Más detalle.`): HealthItem => ({
  id,
  label: id,
  status,
  value: "",
  hint,
  href: `/a/x/es/${id}`,
  action: `Arreglar ${id}`,
});
const alert = (appId: number, kind: TodayAlert["kind"], tone: TodayAlert["tone"], title: string, keywordId: number | null = 9, date = "2026-11-02"): TodayAlert => ({
  appId,
  kind,
  tone,
  title,
  keywordId,
  date,
});
const season = (term: string, days: number): NextSeason => ({ term, month: 11, days, running: days === 0 });

describe("whatToDoToday", () => {
  it("orders by severity across markets and keeps at most 5", () => {
    const tasks = whatToDoToday({
      markets: [
        { market: es, health: [health("coverage", "warn"), health("listing-age", "bad"), health("policy", "good")], seasons: [] },
        { market: other, health: [health("policy", "bad"), health("irrelevant", "warn")], seasons: [season("navidad", 20)] },
      ],
      alerts: [alert(1, "left_top10", "down", "«pastillas» sale del TOP 10"), alert(1, "entered_top10", "up", "«toma» entra en el TOP 10"), alert(2, "moved_down", "down", "«clave» baja 7 posiciones", 3)],
    });
    expect(tasks.map((t) => `${t.market.title}:${t.source}:${t.text}`)).toEqual([
      "Recordatorio:health:listing-age: algo pasa",
      "LockGen:health:policy: algo pasa",
      "Recordatorio:alert:«pastillas» sale del TOP 10",
      "LockGen:alert:«clave» baja 7 posiciones",
      // Coverage (60 + 6) beats the irrelevant keywords (60 + 4) and the peak in 20 days (64).
      "Recordatorio:health:coverage: algo pasa",
    ]);
    expect(tasks[0]).toMatchObject({ severity: "bad", action: "Arreglar listing-age", href: "/a/x/es/listing-age" });
    expect(tasks[2]).toMatchObject({ action: "Ver la keyword", href: "/a/recordatorio/es/keywords/9" });
  });

  it("never turns good news, good lines or lines without a link into tasks", () => {
    const tasks = whatToDoToday({
      markets: [{ market: es, health: [health("coverage", "good"), { ...health("irrelevant", "warn"), href: null, action: null }, health("reviews", "unknown")], seasons: [] }],
      alerts: [alert(1, "moved_up", "up", "«a» sube 6 posiciones"), alert(1, "new_leader", "up", "Eres el nº 1 en «a»")],
    });
    expect(tasks).toEqual([]);
  });

  it("merges a seasonal alert with the coming peak of the same keyword, and the health season line goes", () => {
    const tasks = whatToDoToday({
      markets: [{ market: es, health: [health("season", "warn")], seasons: [season("Pastillero", 28), season("verano", 200)] }],
      alerts: [alert(1, "seasonal_peak", "info", "«pastillero» entra en temporada alta en diciembre")],
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ source: "season", text: "«Pastillero» entra en temporada en 4 semanas", href: "/a/recordatorio/es/ficha" });
  });

  it("keeps a seasonal alert with no matching peak, and one task per keyword", () => {
    const tasks = whatToDoToday({
      markets: [{ market: es, health: [], seasons: [] }],
      alerts: [
        alert(1, "seasonal_peak", "info", "«verano» entra en temporada alta en junio", 5),
        alert(1, "moved_down", "down", "«a» baja 6 posiciones", 7, "2026-11-01"),
        alert(1, "left_top10", "down", "«a» sale del TOP 10", 7, "2026-11-02"),
        // Not a followed market: ignored.
        alert(99, "left_top10", "down", "«b» sale del TOP 10", 8),
      ],
    });
    expect(tasks.map((t) => t.text)).toEqual(["«a» sale del TOP 10", "«verano» entra en temporada alta en junio"]);
  });

  it("shows screenshots and the same outdated listing once per app, not once per country", () => {
    const tasks = whatToDoToday({
      markets: [
        { market: es, health: [health("screenshots", "bad"), health("listing-age", "bad", "La tienda tiene la 2.0.0. Revisa.")], seasons: [] },
        { market: us, health: [health("screenshots", "bad"), health("listing-age", "bad", "La tienda tiene la 2.0.0. Revisa."), health("coverage", "warn")], seasons: [] },
        { market: other, health: [health("listing-age", "bad", "La tienda tiene la 2.0.0. Revisa.")], seasons: [] },
      ],
      alerts: [],
    });
    expect(tasks.map((t) => `${t.market.title}:${t.market.country}:${t.text.split(/[:.]/)[0]}`)).toEqual([
      "LockGen:es:La tienda tiene la 2",
      "Recordatorio:es:La tienda tiene la 2",
      "Recordatorio:es:screenshots",
      "Recordatorio:us:coverage",
    ]);
  });

  it("a peak in season now outranks one starting later, and both outrank a far one", () => {
    const tasks = whatToDoToday({ markets: [{ market: es, health: [], seasons: [season("halloween", 0), season("navidad", 30), season("rebajas", 60)] }], alerts: [] });
    expect(tasks.map((t) => t.text)).toEqual(["«halloween» está en temporada", "«navidad» entra en temporada en 4 semanas"]);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 8 }, (_, i) => alert(1, "lost_ranking", "down", `«k${i}»: ya no apareces en los resultados`, i));
    expect(whatToDoToday({ markets: [{ market: es, health: [], seasons: [] }], alerts: many })).toHaveLength(5);
    expect(whatToDoToday({ markets: [{ market: es, health: [], seasons: [] }], alerts: many }, 3)).toHaveLength(3);
  });
});

describe("firstSentence", () => {
  it("cuts at the first full stop followed by a space, keeping decimals and versions", () => {
    expect(firstSentence("Tu ficha describe la 2.0.0 y ya vas por la 3.0.1. Revisa los textos.")).toBe("Tu ficha describe la 2.0.0 y ya vas por la 3.0.1");
    expect(firstSentence("Sin punto")).toBe("Sin punto");
  });
});
