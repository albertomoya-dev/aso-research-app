import { describe, expect, it } from "vitest";
import { ALL_LOCALES, COUNTRIES, getCountry } from "@/lib/countries";
import {
  baseDraftFor,
  coverageMatrix,
  draftAge,
  EMPTY_DRAFT,
  isMainTarget,
  localeLanguage,
  localeOptions,
  mainLocale,
  marketCountryFor,
  resolveTarget,
  sharesMainLanguage,
  storeLangFor,
  targetLabel,
  targetQuery,
} from "@/lib/listing-drafts";
import type { MetadataDraft } from "@/lib/metadata-check";
import listing from "./fixtures/recordatorio/listing-v2.json";

const published = listing.draft as MetadataDraft;

describe("countries: locales", () => {
  it("gives every country a language-REGION locale that starts with its language", () => {
    for (const c of COUNTRIES) {
      expect(c.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(localeLanguage(c.locale)).toBe(c.lang.split("-")[0]);
    }
    expect(getCountry("es").locale).toBe("es-ES");
    expect(getCountry("mx").locale).toBe("es-MX");
    expect(getCountry("br").locale).toBe("pt-BR");
    expect(getCountry("us").locale).toBe("en-US");
  });

  it("lists the extra App Store languages from Apple's table", () => {
    expect(getCountry("us").extraLocales).toContain("es-MX");
    expect(getCountry("ca").extraLocales).toEqual(["fr-CA"]);
    expect(getCountry("es").extraLocales).toEqual(["ca", "en-GB"]);
    expect(getCountry("gb").extraLocales).toBeUndefined();
    // Never the main locale itself.
    for (const c of COUNTRIES) expect(c.extraLocales ?? []).not.toContain(c.locale);
  });

  it("ALL_LOCALES has no repeats and includes the extra ones", () => {
    expect(new Set(ALL_LOCALES).size).toBe(ALL_LOCALES.length);
    expect(ALL_LOCALES).toEqual(expect.arrayContaining(["es-ES", "en-US", "zh-Hans", "fr-CA"]));
  });
});

describe("resolveTarget", () => {
  it("defaults to the main locale of the app's country", () => {
    expect(mainLocale("es")).toBe("es-ES");
    expect(resolveTarget("es", "android", {})).toEqual({ locale: "es-ES", country: "" });
  });

  it("accepts known locales and ignores unknown ones", () => {
    expect(resolveTarget("es", "ios", { locale: "en-US" })).toEqual({ locale: "en-US", country: "" });
    expect(resolveTarget("es", "ios", { locale: "xx-YY" })).toEqual({ locale: "es-ES", country: "" });
    expect(resolveTarget("es", "ios", { locale: "<script>" })).toEqual({ locale: "es-ES", country: "" });
  });

  it("custom country listings only exist in Google Play", () => {
    expect(resolveTarget("es", "android", { locale: "es-ES", country: "MX" })).toEqual({ locale: "es-ES", country: "mx" });
    expect(resolveTarget("es", "ios", { locale: "es-ES", country: "mx" })).toEqual({ locale: "es-ES", country: "" });
    expect(resolveTarget("es", "android", { country: "zz" })).toEqual({ locale: "es-ES", country: "" });
  });

  it("knows the main listing and the language it shares", () => {
    expect(isMainTarget("es", { locale: "es-ES", country: "" })).toBe(true);
    expect(isMainTarget("es", { locale: "es-ES", country: "mx" })).toBe(false);
    expect(sharesMainLanguage("es", { locale: "es-MX", country: "" })).toBe(true);
    expect(sharesMainLanguage("es", { locale: "en-US", country: "" })).toBe(false);
  });

  it("builds the query string, empty for the main listing", () => {
    expect(targetQuery("es", { locale: "es-ES", country: "" })).toBe("");
    expect(targetQuery("es", { locale: "en-US", country: "" })).toBe("?locale=en-US");
    expect(targetQuery("es", { locale: "es-ES", country: "mx" })).toBe("?locale=es-ES&country=mx");
  });
});

describe("market and store language", () => {
  it("picks the country whose searches represent the locale", () => {
    expect(marketCountryFor({ locale: "en-US", country: "" })).toBe("us");
    expect(marketCountryFor({ locale: "es-ES", country: "mx" })).toBe("mx");
    expect(marketCountryFor({ locale: "ko", country: "" })).toBe("kr");
    expect(marketCountryFor({ locale: "ca", country: "" })).toBe("es");
    expect(marketCountryFor({ locale: "zh-Hans", country: "" })).toBe("sg");
  });

  it("maps locales to the adapters' language codes", () => {
    expect(storeLangFor("es-MX")).toBe("es");
    expect(storeLangFor("zh-TW")).toBe("zh-TW");
    expect(storeLangFor("zh-Hans")).toBe("zh-CN");
    expect(storeLangFor("fr-CA")).toBe("fr");
  });
});

describe("localeOptions", () => {
  it("App Store: main, extra languages of the country, saved drafts, then the rest", () => {
    const options = localeOptions("us", "ios", [{ locale: "de-DE", country: "" }]);
    expect(options[0]).toMatchObject({ locale: "en-US", kind: "main", hasDraft: false });
    expect(options.filter((o) => o.kind === "extra").map((o) => o.locale)).toContain("es-MX");
    expect(options.find((o) => o.locale === "de-DE")).toMatchObject({ kind: "draft", hasDraft: true });
    const keys = options.map((o) => `${o.locale}|${o.country}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("Google Play: no extra languages, but custom listings and the open one", () => {
    const options = localeOptions("es", "android", [{ locale: "es-ES", country: "mx" }], { locale: "es-ES", country: "ar" });
    expect(options.some((o) => o.kind === "extra")).toBe(false);
    expect(options.find((o) => o.country === "mx")).toMatchObject({ kind: "draft", label: "español (España) · ficha personalizada para México" });
    expect(options.find((o) => o.country === "ar")).toMatchObject({ kind: "current", hasDraft: false });
  });

  it("labels locales in Spanish", () => {
    expect(targetLabel({ locale: "en-US", country: "" })).toBe("inglés (Estados Unidos)");
  });
});

describe("baseDraftFor", () => {
  it("starts from the main text in the same language and from the brand alone in another", () => {
    expect(baseDraftFor("es", { locale: "es-ES", country: "" }, published, "Recordatorio")).toBe(published);
    expect(baseDraftFor("es", { locale: "es-ES", country: "mx" }, published, "Recordatorio")).toBe(published);
    expect(baseDraftFor("es", { locale: "en-US", country: "" }, published, "Recordatorio")).toEqual({ ...EMPTY_DRAFT, title: "Recordatorio" });
  });
});

describe("draftAge (H11.6)", () => {
  it("warns when the published listing changed after the draft", () => {
    const age = draftAge("2026-10-27T10:00:00Z", "2026-10-29T08:00:00Z", "2026-10-30T06:00:00Z");
    expect(age?.stale).toBe(true);
    expect(age?.text).toMatch(/^Borrador del 27 oct · la ficha publicada cambió el 29 oct/);
  });

  it("is calm when the draft is newer", () => {
    const age = draftAge(new Date("2026-10-27T10:00:00Z"), "2026-10-20T00:00:00Z");
    expect(age).toEqual({ stale: false, text: "Borrador del 27 oct · la ficha publicada es del 20 oct, anterior a tu borrador." });
  });

  it("without the store date, only says when the listing was read", () => {
    expect(draftAge("2026-10-27T10:00:00Z", null, "2026-10-30T06:00:00Z")).toEqual({
      stale: false,
      text: "Borrador del 27 oct · ficha publicada leída el 30 oct.",
    });
    expect(draftAge("2026-10-27T10:00:00Z", "no es una fecha")?.text).toBe("Borrador del 27 oct");
  });

  it("is null without a saved draft", () => {
    expect(draftAge(null, "2026-10-29T08:00:00Z")).toBeNull();
  });
});

describe("coverageMatrix", () => {
  it("scores each listing for the same keywords, most valuable first", () => {
    const english: MetadataDraft = { ...EMPTY_DRAFT, title: "Pill Reminder", description: "Never miss a dose." };
    const matrix = coverageMatrix(
      "android",
      [
        { locale: "es-ES", country: "", label: "es", draft: published, saved: false },
        { locale: "en-US", country: "", label: "en", draft: english, saved: true },
      ],
      [
        { term: "pastillero", opportunity: 20 },
        { term: "recordatorio pastillas", opportunity: 60 },
      ],
    );
    expect(matrix.rows.map((r) => r.term)).toEqual(["recordatorio pastillas", "pastillero"]);
    expect(matrix.rows[0].cells[0]).toMatchObject({ field: "title" });
    expect(matrix.rows[0].cells[1]).toEqual({ credit: 0, field: null, partial: false });
    expect(matrix.columns[0].score).toBeGreaterThan(0);
    expect(matrix.columns[1]).toMatchObject({ locale: "en-US", score: 0, saved: true });
    expect(matrix.columns[1]).not.toHaveProperty("draft");
  });
});
