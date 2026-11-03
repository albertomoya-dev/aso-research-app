import { describe, expect, it } from "vitest";
import {
  groupMarkets,
  legacyAppId,
  legacyAppRedirect,
  marketPath,
  productPath,
  productSlugBase,
  slugify,
  unfollowConfirmation,
  uniqueSlug,
} from "@/lib/market-path";

describe("slugify", () => {
  it("lower case, no accents, hyphens", () => {
    expect(slugify("Recordatorio de Pastillas")).toBe("recordatorio-de-pastillas");
    expect(slugify("Árbol ñandú · Ça va?")).toBe("arbol-nandu-ca-va");
    expect(slugify("Straße")).toBe("strasse");
    expect(slugify("  --Hola!!  Mundo--  ")).toBe("hola-mundo");
  });

  it("caps at 40 characters without a trailing hyphen", () => {
    const slug = slugify("Una app con un nombre larguísimo para probar el límite de longitud");
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug).toBe("una-app-con-un-nombre-larguisimo-para-pr");
    expect(slugify("abcdefghij abcdefghij abcdefghij abcdefg xyz")).toBe("abcdefghij-abcdefghij-abcdefghij-abcdefg");
    // The cut lands right after a hyphen: it goes too.
    expect(slugify(`${"a".repeat(39)} b`)).toBe("a".repeat(39));
  });

  it("is empty when nothing Latin is left", () => {
    expect(slugify("日本語")).toBe("");
    expect(slugify("!!!")).toBe("");
  });
});

describe("productSlugBase", () => {
  it("takes the tail of an Android package", () => {
    expect(productSlugBase("com.moyalogames.recordatorio", "Recordatorio: pastillas")).toBe("recordatorio");
    expect(productSlugBase("com.Strava_App", "Strava")).toBe("strava-app");
  });

  it("falls back to the title for numeric iOS ids, then to «app»", () => {
    expect(productSlugBase("1234567890", "Pastillero — Recordatorio")).toBe("pastillero-recordatorio");
    expect(productSlugBase("1234567890", "日本語")).toBe("app");
  });
});

describe("uniqueSlug", () => {
  it("adds -2, -3… on collisions", () => {
    expect(uniqueSlug("recordatorio", new Set())).toBe("recordatorio");
    expect(uniqueSlug("recordatorio", new Set(["recordatorio"]))).toBe("recordatorio-2");
    expect(uniqueSlug("recordatorio", new Set(["recordatorio", "recordatorio-2"]))).toBe("recordatorio-3");
  });

  it("keeps a suffixed slug within 40 characters", () => {
    const base = "a".repeat(40);
    const slug = uniqueSlug(base, new Set([base]));
    expect(slug).toBe(`${"a".repeat(38)}-2`);
    expect(slug.length).toBe(40);
    // No double hyphen when the cut lands on one.
    const hyphenated = `${"a".repeat(37)}-bc`;
    expect(uniqueSlug(hyphenated, new Set([hyphenated]))).toBe(`${"a".repeat(37)}-2`);
  });
});

describe("marketPath and productPath", () => {
  const market = { productSlug: "recordatorio", country: "ES" };
  it("builds the market URL with the country in lower case", () => {
    expect(marketPath(market)).toBe("/a/recordatorio/es");
    expect(marketPath(market, "/ficha")).toBe("/a/recordatorio/es/ficha");
    expect(marketPath({ productSlug: "recordatorio", country: "us" }, "/keywords?f=noise")).toBe("/a/recordatorio/us/keywords?f=noise");
  });
  it("builds the app-wide URL", () => {
    expect(productPath("recordatorio")).toBe("/a/recordatorio");
    expect(productPath("recordatorio", "/creativos/logo")).toBe("/a/recordatorio/creativos/logo");
  });
});

describe("legacyAppRedirect", () => {
  const es = { productSlug: "recordatorio", country: "es" };
  it.each([
    [[], "/a/recordatorio/es/keywords"],
    [["keywords", "42"], "/a/recordatorio/es/keywords/42"],
    [["descubrir"], "/a/recordatorio/es/descubrir"],
    [["ideas"], "/a/recordatorio/es/ideas"],
    [["top10"], "/a/recordatorio/es/top10"],
    [["resenas"], "/a/recordatorio/es/resenas"],
    [["competidores"], "/a/recordatorio/es/competidores"],
    [["estacionalidad"], "/a/recordatorio/es/tendencias"],
    [["cambios"], "/a/recordatorio/es/cambios"],
    [["metadata"], "/a/recordatorio/es/ficha"],
    [["metadata", "publicar"], "/a/recordatorio/es/ficha/publicar"],
    [["producto"], "/a/recordatorio/ajustes/producto"],
    [["creativos"], "/a/recordatorio/creativos"],
    [["creativos", "icono"], "/a/recordatorio/creativos/icono"],
    [["creativos", "logo"], "/a/recordatorio/creativos/logo"],
    [["creativos", "video"], "/a/recordatorio/creativos/video"],
  ])("/apps/1/%j → %s", (rest, expected) => {
    expect(legacyAppRedirect(es, rest)).toBe(expected);
  });

  it("keeps the query string", () => {
    expect(legacyAppRedirect(es, [], "?f=top10&s=position")).toBe("/a/recordatorio/es/keywords?f=top10&s=position");
    expect(legacyAppRedirect(es, ["metadata"], "?locale=en-US")).toBe("/a/recordatorio/es/ficha?locale=en-US");
    expect(legacyAppRedirect(es, ["creativos"], "?x=1")).toBe("/a/recordatorio/creativos?x=1");
  });

  it("is null for pages that never existed", () => {
    expect(legacyAppRedirect(es, ["nada"])).toBeNull();
    expect(legacyAppRedirect(es, ["keywords", "abc"])).toBeNull();
    expect(legacyAppRedirect(es, ["keywords", "1", "2"])).toBeNull();
    expect(legacyAppRedirect(es, ["ideas", "x"])).toBeNull();
    expect(legacyAppRedirect(es, ["metadata", "otra"])).toBeNull();
    expect(legacyAppRedirect(es, ["creativos", "otra"])).toBeNull();
    expect(legacyAppRedirect(es, ["producto", "x"])).toBeNull();
  });
});

describe("legacyAppId", () => {
  it("reads only positive integers", () => {
    expect(legacyAppId("1")).toBe(1);
    expect(legacyAppId("4")).toBe(4);
    expect(legacyAppId("nueva")).toBeNull();
    expect(legacyAppId("0")).toBeNull();
    expect(legacyAppId("01")).toBeNull();
    expect(legacyAppId("-1")).toBeNull();
    expect(legacyAppId("1.5")).toBeNull();
    expect(legacyAppId("99999999999")).toBeNull();
  });
});

describe("groupMarkets", () => {
  const row = (productId: number, marketId: number, country: string, keywords = 0) => ({
    productId,
    slug: `p${productId}`,
    title: `P${productId}`,
    icon: "i",
    store: "android" as const,
    developer: "Dev",
    marketId,
    country,
    keywords,
  });
  it("one entry per product, markets oldest first, product order kept", () => {
    const grouped = groupMarkets([row(2, 3, "es"), row(1, 4, "us", 7), row(1, 1, "es", 30)]);
    expect(grouped.map((p) => p.id)).toEqual([2, 1]);
    expect(grouped[1].markets).toEqual([
      { id: 1, country: "es", keywords: 30 },
      { id: 4, country: "us", keywords: 7 },
    ]);
  });
});

describe("unfollowConfirmation", () => {
  it("keeps the product's data while other countries are followed", () => {
    expect(unfollowConfirmation("Recordatorio", "España", ["Estados Unidos"])).toBe(
      "¿Dejar de seguir Recordatorio en España? Se borrarán las keywords y el histórico de España. La ficha de producto, las marcas excluidas y los creativos se conservan porque sigues la app en Estados Unidos.",
    );
    expect(unfollowConfirmation("Recordatorio", "España", ["Estados Unidos", "México", "Chile"])).toMatch(/en Estados Unidos, México y Chile\.$/);
  });

  it("warns that the last country takes the product's data with it", () => {
    expect(unfollowConfirmation("Recordatorio", "España", [])).toBe(
      "¿Dejar de seguir Recordatorio? Es el último país que sigues: se borrarán sus keywords, su histórico, la ficha de producto, las marcas excluidas y los creativos.",
    );
  });
});
