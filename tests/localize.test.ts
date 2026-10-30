import { describe, expect, it } from "vitest";
import type { ListingOutput } from "@/lib/listing-optimizer";
import {
  buildLocalizePrompt,
  cleanLocalizedProposal,
  LOCALIZE_PROMPT_VERSION,
  LOCALIZE_SYSTEM_PROMPT,
  type LocalizePromptInput,
  MAX_MARKET_SUGGESTIONS,
} from "@/lib/localize";
import type { MetadataDraft } from "@/lib/metadata-check";
import listing from "./fixtures/recordatorio/listing-v2.json";

const source = listing.draft as MetadataDraft;

const input = (o: Partial<LocalizePromptInput> = {}): LocalizePromptInput => ({
  store: "android",
  sourceLocale: "es-ES",
  targetLocale: "en-US",
  marketCountryName: "Estados Unidos",
  brand: "Recordatorio",
  source,
  sourceKeywords: [
    { term: "pastillero", opportunity: 20 },
    { term: "recordatorio pastillas", opportunity: 60 },
  ],
  autocomplete: ["pill reminder", "pill reminder app", "medication tracker"],
  topTitles: ["Medisafe Pill Reminder", "MyTherapy"],
  category: "Medical",
  facts: "PRODUCT FACTS (declared by the app owner):\n- Scan the barcode",
  avoidBrands: ["Medisafe"],
  ...o,
});

describe("localize prompt", () => {
  it("has a version and asks for adaptation, not translation", () => {
    expect(LOCALIZE_PROMPT_VERSION).toBe("loc-1");
    expect(LOCALIZE_SYSTEM_PROMPT).toMatch(/NOT a literal translation/);
    expect(LOCALIZE_SYSTEM_PROMPT).toMatch(/medicinas/);
  });

  it("includes the source, the target market data, the facts and the brands to avoid", () => {
    const prompt = buildLocalizePrompt(input());
    expect(prompt).toContain("Write the listing for locale: en-US (market data from Estados Unidos)");
    expect(prompt).toContain(`title (${[...source.title].length}/30): ${source.title}`);
    expect(prompt).toContain("- pill reminder");
    expect(prompt).toContain("- Medisafe Pill Reminder");
    expect(prompt).toContain("Scan the barcode");
    expect(prompt).toContain("Other brands, never use them: Medisafe");
    // Source keywords, best first.
    expect(prompt.indexOf("recordatorio pastillas")).toBeLessThan(prompt.indexOf("- pastillero |"));
    // Google Play: no subtitle or keyword field lines.
    expect(prompt).not.toMatch(/^keywordField/m);
  });

  it("says so when there is no market data and caps the suggestions", () => {
    expect(buildLocalizePrompt(input({ autocomplete: [], topTitles: [], marketCountryName: null }))).toContain("(none available: rely on natural local wording)");
    const many = Array.from({ length: 100 }, (_, i) => `term ${i}`);
    const prompt = buildLocalizePrompt(input({ autocomplete: many }));
    expect(prompt).toContain(`- term ${MAX_MARKET_SUGGESTIONS - 1}`);
    expect(prompt).not.toContain(`- term ${MAX_MARKET_SUGGESTIONS}\n`);
  });

  it("shows the existing listing in the target market only when it has text, and the feedback", () => {
    expect(buildLocalizePrompt(input({ existing: { ...source, title: "" , shortDescription: "", description: "" } }))).not.toContain("current listing in en-US");
    const prompt = buildLocalizePrompt(input({ existing: { ...source, title: "Pill Reminder" } }), ["title has 40 characters, the limit is 30."]);
    expect(prompt).toContain("The app's current listing in en-US");
    expect(prompt).toContain("- title has 40 characters, the limit is 30.");
  });
});

describe("cleanLocalizedProposal", () => {
  const output: ListingOutput = {
    title: "  Recordatorio:  Pill Reminder ",
    subtitle: "ignored",
    keywordField: "ignored",
    shortDescription: "Never miss a dose with a simple pill reminder and medication tracker today",
    description: "Line one.\n\n\n\nLine two.",
    targetKeywords: ["pill reminder", "Pill Reminder", " medication tracker ", ""],
    changes: [{ field: "title", why: "«pill reminder» es lo que más se busca." }, { field: "nope", why: "x" }],
    notes: ["Nota"],
  };

  it("keeps the store's fields tidy and the local keywords, deduplicated", () => {
    const p = cleanLocalizedProposal("android", output);
    expect(p.fields).toEqual({
      title: "Recordatorio: Pill Reminder",
      shortDescription: output.shortDescription,
      description: "Line one.\n\nLine two.",
    });
    expect(p.targetKeywords).toEqual(["pill reminder", "medication tracker"]);
    expect(p.changes).toEqual([{ field: "title", why: "«pill reminder» es lo que más se busca." }]);
    expect(p.over).toEqual([]);
  });

  it("flags fields over the limit", () => {
    const p = cleanLocalizedProposal("android", { ...output, title: "Recordatorio: Pill Reminder & Medication Tracker" });
    expect(p.over).toEqual(["title"]);
  });
});
