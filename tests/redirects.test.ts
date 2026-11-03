import { describe, expect, it } from "vitest";
import { activityHref, kindsForType, parseActivityFilters, periodStart, typeOfKind } from "@/lib/activity";
import { ALL_ALERT_KINDS } from "@/lib/alerts";
import { GLOBAL_REDIRECTS, globalRedirectTarget } from "@/lib/redirects";

describe("global redirects", () => {
  it("are permanent (308) and point to the new pages", () => {
    expect(GLOBAL_REDIRECTS.every((r) => r.permanent)).toBe(true);
    expect(Object.fromEntries(GLOBAL_REDIRECTS.map((r) => [r.source, r.destination]))).toEqual({
      "/novedades": "/actividad",
      "/resumen": "/actividad?vista=semana",
      "/ajustes": "/integraciones",
      "/buscar": "/apps/nueva",
    });
  });

  it("keep the query, appended to the destination's own", () => {
    expect(globalRedirectTarget("/novedades", "?app=3")).toBe("/actividad?app=3");
    expect(globalRedirectTarget("/resumen")).toBe("/actividad?vista=semana");
    expect(globalRedirectTarget("/resumen", "?app=3")).toBe("/actividad?vista=semana&app=3");
    expect(globalRedirectTarget("/buscar", "?q=pills&store=android&country=es")).toBe("/apps/nueva?q=pills&store=android&country=es");
    expect(globalRedirectTarget("/ajustes/")).toBe("/integraciones");
  });

  it("leave other paths alone (the app settings are not the old global /ajustes)", () => {
    expect(globalRedirectTarget("/a/recordatorio/ajustes")).toBeNull();
    expect(globalRedirectTarget("/actividad")).toBeNull();
  });
});

describe("Actividad filters", () => {
  it("default to the feed of the last 7 days, every app and type", () => {
    expect(parseActivityFilters({})).toEqual({ period: "7", appId: null, type: null, view: "feed" });
    expect(activityHref(parseActivityFilters({}))).toBe("/actividad");
  });

  it("read the old /novedades ?app= and the old /resumen view", () => {
    expect(parseActivityFilters({ app: "4", vista: "semana", periodo: "30", tipo: "competidor" })).toEqual({
      period: "30",
      appId: 4,
      type: "competidor",
      view: "semana",
    });
  });

  it("ignore unknown values", () => {
    expect(parseActivityFilters({ app: "-1", periodo: "90", tipo: "x", vista: "otra" })).toEqual({ period: "7", appId: null, type: null, view: "feed" });
    expect(parseActivityFilters({ app: ["1", "2"] }).appId).toBeNull();
  });

  it("build links that only carry what differs from the defaults", () => {
    const f = parseActivityFilters({});
    expect(activityHref(f, { period: "hoy" })).toBe("/actividad?periodo=hoy");
    expect(activityHref(f, { view: "semana" })).toBe("/actividad?vista=semana");
    expect(activityHref(f, { appId: 3, type: "posicion" })).toBe("/actividad?app=3&tipo=posicion");
  });

  it("count the period from today, inclusive", () => {
    expect(periodStart("hoy", "2026-11-03")).toBe("2026-11-03");
    expect(periodStart("7", "2026-11-03")).toBe("2026-10-28");
    expect(periodStart("30", "2026-11-03")).toBe("2026-10-05");
  });

  it("every alert kind belongs to exactly one type", () => {
    for (const kind of ALL_ALERT_KINDS) {
      const types = ["posicion", "competidor", "temporada"].filter((t) => kindsForType(t)!.includes(kind));
      expect(types, kind).toHaveLength(1);
      expect(typeOfKind(kind)).toBe(types[0]);
    }
    expect(kindsForType(null)).toBeNull();
  });
});
