import { describe, expect, it } from "vitest";
import { activeNavId, ALL_NAV_ENTRIES, flag, NAV_GROUPS, navHref, parseAppPath, pickMarket, SETTINGS_ENTRY, switchMarketPath } from "@/lib/app-nav";

const es = { productSlug: "recordatorio", country: "es" };

describe("sidebar config", () => {
  it("has Resumen, then the KEYWORDS, MERCADO and OPTIMIZAR groups, and the settings at the foot", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([null, "Keywords", "Mercado", "Optimizar"]);
    expect(NAV_GROUPS.flatMap((g) => g.entries.map((e) => e.label))).toEqual([
      "Resumen",
      "Seguimiento",
      "Encontrar",
      "Competidores",
      "Reseñas",
      "Tendencias",
      "Ficha de la tienda",
      "Creativos",
      "Cambios y pruebas",
    ]);
    expect(SETTINGS_ENTRY.label).toBe("Ajustes de la app");
  });

  it("ids are unique", () => {
    const ids = ALL_NAV_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds market links, and product links that keep the market as ?m=", () => {
    const byId = Object.fromEntries(ALL_NAV_ENTRIES.map((e) => [e.id, navHref(e, es)]));
    expect(byId.resumen).toBe("/a/recordatorio/es");
    expect(byId.seguimiento).toBe("/a/recordatorio/es/keywords");
    expect(byId.encontrar).toBe("/a/recordatorio/es/encontrar");
    expect(byId.ficha).toBe("/a/recordatorio/es/ficha");
    expect(byId.creativos).toBe("/a/recordatorio/creativos?m=es");
    expect(byId.ajustes).toBe("/a/recordatorio/ajustes?m=es");
    expect(navHref(SETTINGS_ENTRY, { productSlug: "x", country: "US" })).toBe("/a/x/ajustes?m=us");
  });
});

describe("activeNavId", () => {
  it.each([
    ["/a/recordatorio/es", "resumen"],
    ["/a/recordatorio/es/keywords", "seguimiento"],
    ["/a/recordatorio/es/keywords/12", "seguimiento"],
    ["/a/recordatorio/es/encontrar", "encontrar"],
    ["/a/recordatorio/es/resenas", "resenas"],
    ["/a/recordatorio/es/tendencias", "tendencias"],
    ["/a/recordatorio/es/ficha/publicar", "ficha"],
    ["/a/recordatorio/es/cambios", "cambios"],
    ["/a/recordatorio/creativos", "creativos"],
    ["/a/recordatorio/creativos/video", "creativos"],
    ["/a/recordatorio/ajustes", "ajustes"],
    ["/a/recordatorio/ajustes/zona", "ajustes"],
    ["/a/recordatorio/es/desconocida", null],
    ["/actividad", null],
    ["/", null],
  ])("%s → %s", (path, id) => {
    expect(activeNavId(path)).toBe(id);
  });
});

describe("parseAppPath", () => {
  it("tells market pages from app-wide pages", () => {
    expect(parseAppPath("/a/x/es/ficha?locale=en-US")).toEqual({ slug: "x", country: "es", rest: ["ficha"] });
    expect(parseAppPath("/a/x/creativos/logo")).toEqual({ slug: "x", country: null, rest: ["creativos", "logo"] });
    expect(parseAppPath("/a/x")).toEqual({ slug: "x", country: null, rest: [] });
    expect(parseAppPath("/apps/nueva")).toBeNull();
  });
});

describe("switchMarketPath", () => {
  it("keeps the same sub-page in the other market", () => {
    expect(switchMarketPath("/a/recordatorio/es/resenas", "us")).toBe("/a/recordatorio/us/resenas");
    expect(switchMarketPath("/a/recordatorio/es", "US")).toBe("/a/recordatorio/us");
    expect(switchMarketPath("/a/recordatorio/es/ficha/publicar", "mx")).toBe("/a/recordatorio/mx/ficha/publicar");
  });

  it("sends a keyword's page to the list (the other market may not follow it) and drops the query", () => {
    expect(switchMarketPath("/a/recordatorio/es/keywords/42", "us")).toBe("/a/recordatorio/us/keywords");
    expect(switchMarketPath("/a/recordatorio/es/ficha?locale=en-US&country=us", "us")).toBe("/a/recordatorio/us/ficha");
  });

  it("leaves app-wide pages where they are", () => {
    expect(switchMarketPath("/a/recordatorio/creativos/icono", "us")).toBe("/a/recordatorio/creativos/icono");
    expect(switchMarketPath("/a/recordatorio/ajustes/marcas?m=es", "us")).toBe("/a/recordatorio/ajustes/marcas");
  });
});

describe("pickMarket", () => {
  const markets = [{ country: "es" }, { country: "us" }];
  it("prefers ?m=, then the cookie, then the primary market", () => {
    expect(pickMarket(markets, "us", "es")?.country).toBe("us");
    expect(pickMarket(markets, null, "us")?.country).toBe("us");
    expect(pickMarket(markets, "fr", "zz")?.country).toBe("es");
    expect(pickMarket(markets)?.country).toBe("es");
    expect(pickMarket([], "es")).toBeUndefined();
  });
});

describe("flag", () => {
  it("turns a country code into its regional indicator pair", () => {
    expect(flag("es")).toBe("🇪🇸");
    expect(flag("US")).toBe("🇺🇸");
    expect(flag("xyz")).toBe("");
  });
});
