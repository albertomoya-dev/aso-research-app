import { describe, expect, it } from "vitest";
import type { ListingOutput } from "@/lib/listing-optimizer";
import {
  buildLocalizePrompt,
  cleanLocalizedProposal,
  inferredAppName,
  inferredBrandWords,
  isBlockingIssue,
  type LanguageCheckOptions,
  languageIssues,
  languageWarnings,
  localizeWithChecks,
  LOCALIZE_PROMPT_VERSION,
  LOCALIZE_SYSTEM_PROMPT,
  type LocalizePromptInput,
  MAX_MARKET_SUGGESTIONS,
  nameContext,
  properNouns,
} from "@/lib/localize";
import type { MetadataDraft } from "@/lib/metadata-check";
import listing from "./fixtures/recordatorio/listing-v2.json";

const source = listing.draft as MetadataDraft;

const input = (o: Partial<LocalizePromptInput> = {}): LocalizePromptInput => ({
  store: "android",
  sourceLocale: "es-ES",
  targetLocale: "en-US",
  marketCountryName: "Estados Unidos",
  brand: "",
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
    expect(LOCALIZE_PROMPT_VERSION).toBe("loc-4");
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

describe("localize prompt: brand and source keywords (H12)", () => {
  it("without a declared brand, the source title is not kept", () => {
    const prompt = buildLocalizePrompt(input());
    expect(prompt).toContain("Declared brand: none. The source title is not a brand: adapt all of it.");
    expect(LOCALIZE_SYSTEM_PROMPT).not.toMatch(/Keep the app's brand name at the start of the title, exactly as it is, untranslated/);
    expect(buildLocalizePrompt(input({ brand: "Runly" }))).toContain("Declared brand (keep it at the start of the title, untranslated): Runly");
  });

  it("without a declared brand, a name-like head of the source title is offered as the app's name", () => {
    const prompt = buildLocalizePrompt(input({ source: { ...source, title: "Pill Buddy: recordatorio" } }));
    expect(prompt).toContain("Declared brand: none. The source title starts with what looks like the app's name «Pill Buddy»: keep it unless it is a plain description.");
    expect(buildLocalizePrompt(input({ source: { ...source, title: "MediTrack" } }))).toContain("app's name «MediTrack»");
    // A declared brand wins.
    expect(buildLocalizePrompt(input({ brand: "Runly", source: { ...source, title: "Pill Buddy" } }))).not.toContain("looks like the app's name");
  });

  it("in another language, sends the source keywords as concepts, not keywords", () => {
    const prompt = buildLocalizePrompt(input());
    expect(prompt).toContain("Write every field in the language of en-US, not in the language of es-ES.");
    expect(prompt).toMatch(/CONCEPTS TO COVER ONLY: they are not keywords for this listing/);
    const same = buildLocalizePrompt(input({ targetLocale: "es-MX", marketCountryName: "México" }));
    expect(same).not.toContain("CONCEPTS TO COVER ONLY");
    expect(same).not.toContain("not in the language of");
  });

  it("lists the keywords tracked in the target market first", () => {
    const prompt = buildLocalizePrompt(input({ marketKeywords: ["pill reminder", "med tracker"] }));
    expect(prompt).toContain("TARGET MARKET keywords the owner tracks there");
    expect(prompt.indexOf("- med tracker")).toBeLessThan(prompt.indexOf("TARGET MARKET autocomplete"));
  });
});

// The main listing of the real case (H12): a title made only of keywords.
const main: MetadataDraft = { ...source, title: "Recordatorio pastillas: alarma" };
// What the model answered: the listing kept in Spanish.
const spanish: ListingOutput = {
  title: "Recordatorio pastillas: alarma",
  subtitle: "",
  keywordField: "",
  shortDescription: "Pastillero digital fácil: alarmas de medicamentos y control de tu tratamiento",
  description: source.description,
  targetKeywords: ["recordatorio pastillas", "pastillero virtual"],
  changes: [],
  notes: ["Se mantiene el español de España: la ficha es para Google Play España."],
};
const english: ListingOutput = {
  title: "Pill Reminder: Med Alarm",
  subtitle: "",
  keywordField: "",
  shortDescription: "Never miss a dose: alarms for all your medications and your treatment log",
  description:
    "Do you forget to take your medication? This pill reminder alerts you at the exact time of each dose.\n\nAdd your medicines and get an alarm even when the app is closed. It is not a medical device and does not replace the advice of your doctor.",
  targetKeywords: ["pill reminder", "med alarm"],
  changes: [],
  notes: [],
};

describe("languageIssues", () => {
  const opts: { sourceLocale: string; targetLocale: string; source: MetadataDraft; brand: string; sourceKeywords?: string[] } = {
    sourceLocale: "es-ES",
    targetLocale: "en-US",
    source: main,
    brand: "",
  };

  it("flags every field of a Spanish answer for en-US, the title because it is copied", () => {
    const issues = languageIssues("android", cleanLocalizedProposal("android", spanish), opts);
    expect(issues).toEqual([
      { field: "title", found: "es", reason: "copied" },
      { field: "shortDescription", found: "es", reason: "copied" },
      { field: "description", found: "es", reason: "copied" },
      { field: "targetKeywords", found: "es", reason: "copied", words: ["recordatorio pastillas"] },
    ]);
    const rewritten = { ...spanish, title: "Recordatorio de pastillas y alarma", shortDescription: "Alarmas para tus pastillas y el control de tu tratamiento" };
    expect(languageIssues("android", cleanLocalizedProposal("android", rewritten), opts).map((i) => [i.field, i.reason])).toEqual([
      ["title", "mixed"],
      ["shortDescription", "language"],
      ["description", "copied"],
      ["targetKeywords", "copied"],
    ]);
  });

  it("accepts an English answer, a declared brand left as is and short fields", () => {
    expect(languageIssues("android", cleanLocalizedProposal("android", english), opts)).toEqual([]);
    const branded = { ...english, title: "Recordatorio" };
    expect(languageIssues("android", cleanLocalizedProposal("android", branded), { ...opts, brand: "Recordatorio", source: { ...source, title: "Recordatorio" } })).toEqual([]);
  });

  // Review finding 6: short fields under MIN_WORDS used to pass half translated.
  it("flags short fields that keep words of the source title or keywords", () => {
    const check = (title: string, extra: Partial<typeof opts> = {}) =>
      languageIssues("android", cleanLocalizedProposal("android", { ...english, title }), { ...opts, ...extra });
    expect(check("Pill reminder: Recordatorio pastillas")).toEqual([
      { field: "title", found: "es", reason: "mixed", words: ["recordatorio", "pastillas"] },
    ]);
    expect(check("Recordatorio pastillas: alarm")).toEqual([{ field: "title", found: "es", reason: "mixed", words: ["recordatorio", "pastillas"] }]);
    // Half the words from the source keywords is enough in a two-word title.
    expect(check("Pastillero Reminder", { sourceKeywords: ["pastillero"] }).map((i) => i.reason)).toEqual(["mixed"]);
    // The declared brand is not a source word.
    expect(check("Recordatorio: Pill Reminder", { brand: "Recordatorio" })).toEqual([]);
    // Same-language targets are never "mixed".
    expect(check("Recordatorio pastillas: alarma", { targetLocale: "es-MX" }).filter((i) => i.field === "title")).toEqual([]);
  });

  it("checks the language of the target keywords and whether they are copied", () => {
    const withKeywords = (targetKeywords: string[]) =>
      languageIssues("android", cleanLocalizedProposal("android", { ...english, targetKeywords }), { ...opts, sourceKeywords: ["pastillero"] });
    expect(withKeywords(["recordatorio de pastillas para la tensión", "pastillero para el día"])).toMatchObject([{ field: "targetKeywords", reason: "language" }]);
    expect(withKeywords(["pastillero", "recordatorio pastillas", "pill reminder"])).toMatchObject([
      { field: "targetKeywords", reason: "copied", words: ["pastillero", "recordatorio pastillas"] },
    ]);
    expect(withKeywords(["pill reminder", "med alarm", "pastillero"])).toEqual([]);
  });

  it("within the same language (es-MX), Spanish is right", () => {
    expect(languageIssues("android", cleanLocalizedProposal("android", spanish), { ...opts, targetLocale: "es-MX" })).toEqual([]);
  });
});

describe("localizeWithChecks: the decision of «Adaptar a en-US» (H12)", () => {
  const run = (answers: (ListingOutput | null)[], problems: (p: unknown) => string[] = () => []) => {
    const calls: (string[] | undefined)[] = [];
    const outcome = localizeWithChecks({
      store: "android",
      sourceLocale: "es-ES",
      targetLocale: "en-US",
      source: main,
      brand: "",
      problems,
      generate: async (feedback) => {
        calls.push(feedback);
        const output = answers[calls.length - 1];
        return output ? { output, model: `m${calls.length}` } : null;
      },
    });
    return { outcome, calls };
  };

  it("never returns a proposal in Spanish: retries with feedback, then fails", async () => {
    const { outcome, calls } = run([spanish, spanish]);
    const result = await outcome;
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("en español en vez de en inglés");
      expect(result.error).toContain("también al reintentarlo");
    }
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBeUndefined();
    expect(calls[1]).toContain("description is copied unchanged from the source listing. Write it in English (en-US).");
  });

  it("fails too when the retry call itself fails", async () => {
    const result = await run([spanish, null]).outcome;
    expect(result).toEqual({ error: expect.stringContaining("en español en vez de en inglés. No se muestra") });
  });

  it("takes the English retry", async () => {
    const result = await run([spanish, english]).outcome;
    expect(result).toMatchObject({ model: "m2", attempts: 2, proposal: { fields: { title: "Pill Reminder: Med Alarm" } } });
  });

  it("an English first answer with no problems needs no retry; with problems, keeps the better one", async () => {
    const { outcome, calls } = run([english]);
    expect(await outcome).toMatchObject({ model: "m1", attempts: 1 });
    expect(calls).toHaveLength(1);
    // The retry has more problems than the first: the first stays.
    let n = 0;
    const counted = run([english, english], () => (n++ === 0 ? ["title has 31 characters, the limit is 30."] : ["a", "b"]));
    expect(await counted.outcome).toMatchObject({ model: "m1", attempts: 2 });
  });
});

// Review of H12: only another language or a copied field block; mixed words and copied keywords are advisory.
describe("languageIssues: advisory checks without false positives", () => {
  const check = (proposal: Partial<ListingOutput>, opts: Partial<LanguageCheckOptions> & { source: MetadataDraft }) =>
    languageIssues("android", cleanLocalizedProposal("android", { ...english, ...proposal }), {
      sourceLocale: "es-ES",
      targetLocale: "en-US",
      brand: "",
      ...opts,
    });

  it("only a wrong language or a copied field blocks", () => {
    expect(isBlockingIssue({ field: "title", found: "es", reason: "language" })).toBe(true);
    expect(isBlockingIssue({ field: "title", found: "es", reason: "copied" })).toBe(true);
    expect(isBlockingIssue({ field: "title", found: "es", reason: "mixed", words: ["recordatorio"] })).toBe(false);
    expect(isBlockingIssue({ field: "targetKeywords", found: "es", reason: "copied", words: ["pastillero"] })).toBe(false);
    expect(isBlockingIssue({ field: "targetKeywords", found: "es", reason: "language" })).toBe(true);
  });

  it("a cognate in the target market data is not a source word («Control de Diabetes» → «Diabetes Control»)", () => {
    const diabetes: MetadataDraft = { ...source, title: "Control de Diabetes", shortDescription: "Apunta tu glucosa y controla la diabetes cada día" };
    const proposal = { title: "Diabetes Control", targetKeywords: ["diabetes control", "blood sugar log"] };
    expect(check(proposal, { source: diabetes, marketTerms: ["diabetes control app", "blood sugar tracker"] })).toEqual([]);
    // Without market data it is only advisory.
    expect(check(proposal, { source: diabetes }).filter(isBlockingIssue)).toEqual([]);
  });

  it("an undeclared brand at the head of the source title is kept («Pill Buddy: recordatorio»)", () => {
    const buddy: MetadataDraft = { ...source, title: "Pill Buddy: recordatorio" };
    expect(check({ title: "Pill Buddy: Medication Reminder" }, { source: buddy })).toEqual([]);
    expect(inferredBrandWords("Pill Buddy: recordatorio")).toEqual(["pill", "buddy"]);
    // A title made of keywords is not a brand.
    expect(inferredBrandWords("Recordatorio pastillas: alarma")).toEqual([]);
    expect(inferredBrandWords("Recordatorio Pastillas: alarma")).toEqual([]);
  });

  it("an English keyword tracked by a Spanish app is not a Spanish word («pill reminder»)", () => {
    expect(check({ title: "Pill Reminder: Med Alarm", targetKeywords: ["pill reminder", "med alarm"] }, { source: main, sourceKeywords: ["pill reminder", "pastillero"] })).toEqual([]);
  });

  it("product and platform names of the source are kept («Google Fit», «Wear OS», «iPhone»)", () => {
    const synced: MetadataDraft = {
      ...source,
      title: "Recordatorio pastillas: alarma",
      shortDescription: "Alarmas de medicamentos en tu reloj Wear OS y en Google Fit",
      description: `${source.description}\n\nSincroniza tus tomas con Google Fit y tu reloj Wear OS. También en iPhone.`,
    };
    const names = properNouns(synced);
    for (const w of ["wear", "google", "fit", "iphone", "cima", "aemps"]) expect(names).toContain(w);
    // Headings in capitals and words at the start of a phrase are not names.
    for (const w of ["exactas", "desde", "tratamiento", "recordatorio", "pastillas", "alarmas", "sincroniza"]) expect(names).not.toContain(w);
    expect(check({ title: "Pill Reminder for Wear OS", shortDescription: "Medication alarms on your Wear OS watch, synced with Google Fit" }, { source: synced })).toEqual([]);
  });

  // Review: a title that is only the app's name, kept unchanged in a correct proposal, is not «copied».
  it("a title that is only the app's name is kept, not copied («MediTrack», «Pill Buddy»)", () => {
    for (const title of ["MediTrack", "Pill Buddy"]) {
      const issues = check({ title }, { source: { ...source, title } });
      expect(issues).toEqual([]);
    }
  });

  it("a keyword-only Spanish title or a Spanish proposal copied unchanged still blocks", () => {
    const keywordsOnly: MetadataDraft = { ...source, title: "Recordatorio pastillas" };
    const issues = check({ title: "Recordatorio pastillas" }, { source: keywordsOnly });
    expect(issues).toContainEqual({ field: "title", found: "es", reason: "copied" });
    expect(issues.some(isBlockingIssue)).toBe(true);
    const spanishIssues = check(spanish, { source: main });
    expect(spanishIssues.filter(isBlockingIssue).map((i) => i.field)).toEqual(["title", "shortDescription", "description"]);
  });

  it("es → pt-BR: a shared word is advisory, and nothing with market data («medicamentos»)", () => {
    const meds: MetadataDraft = { ...source, title: "Recordatorio de medicamentos" };
    const opts = { source: meds, targetLocale: "pt-BR" };
    const proposal = { title: "Lembrete de medicamentos", shortDescription: "", description: "", targetKeywords: ["lembrete de remédio"] };
    const issues = check(proposal, opts);
    expect(issues).toEqual([{ field: "title", found: "es", reason: "mixed", words: ["medicamentos"] }]);
    expect(issues.filter(isBlockingIssue)).toEqual([]);
    expect(check(proposal, { ...opts, marketTerms: ["lembrete de medicamentos", "alarme remédio"] })).toEqual([]);
  });

  it("the H12 case is still flagged, as advisory, with a warning for the user", () => {
    const issues = check({ title: "Pill reminder: Recordatorio pastillas" }, { source: main });
    expect(issues).toEqual([{ field: "title", found: "es", reason: "mixed", words: ["recordatorio", "pastillas"] }]);
    expect(issues.some(isBlockingIssue)).toBe(false);
    expect(languageWarnings(issues, "en-US")).toEqual([
      "El título conserva palabras de la ficha original (recordatorio, pastillas): comprueba si deberían ir en inglés o si son nombres propios.",
    ]);
  });
});

describe("localizeWithChecks: advisory issues never hide the proposal", () => {
  const mixed: ListingOutput = { ...english, title: "Pill reminder: Recordatorio pastillas" };
  const run = (answers: ListingOutput[]) => {
    const calls: (string[] | undefined)[] = [];
    const outcome = localizeWithChecks({
      store: "android",
      sourceLocale: "es-ES",
      targetLocale: "en-US",
      source: main,
      brand: "",
      problems: () => [],
      generate: async (feedback) => {
        calls.push(feedback);
        const output = answers[calls.length - 1];
        return output ? { output, model: `m${calls.length}` } : null;
      },
    });
    return { outcome, calls };
  };

  it("retries a mixed title once and, if it stays, returns it with a warning", async () => {
    const { outcome, calls } = run([mixed, mixed]);
    const result = await outcome;
    expect(calls).toHaveLength(2);
    expect(calls[1]?.[0]).toMatch(/^title keeps words of the source listing \(recordatorio, pastillas\)/);
    expect(result).toMatchObject({ model: "m2", attempts: 2, proposal: { fields: { title: "Pill reminder: Recordatorio pastillas" } } });
    if (!("error" in result)) expect(result.warnings).toHaveLength(1);
  });

  it("prefers the retry without advisory issues, and the first answer when the retry is worse", async () => {
    const fixed = await run([mixed, english]).outcome;
    expect(fixed).toMatchObject({ model: "m2", warnings: [] });
    const worse = await run([english, mixed]).outcome;
    expect(worse).toMatchObject({ model: "m1", attempts: 1, warnings: [] });
  });

  it("a Spanish answer is still refused", async () => {
    const result = await run([spanish, spanish]).outcome;
    expect(result).toEqual({ error: expect.stringContaining("en español en vez de en inglés") });
  });
});

// Review 2026-10-30: a descriptive Spanish title in Title Case is not the app's name.
describe("languageIssues: Title Case descriptive titles are not names", () => {
  const desc =
    "Recordatorio de pastillas para tomar tus medicamentos a tiempo. Configura alarmas para cada toma y lleva un registro de tus dosis. Esta app no es un dispositivo médico y no sustituye el consejo de tu médico.";
  const shortDescription = "Alarma para tomar tus pastillas y medicamentos a tiempo cada día";
  const sourceKeywords = ["recordatorio pastillas", "alarma medicamentos", "pastillero"];
  const keywordWords = new Set(sourceKeywords.flatMap((k) => k.split(" ")));
  const english = {
    subtitle: "",
    shortDescription: "Take your pills on time with daily reminders and alarms",
    keywordField: "",
    description:
      "Pill reminder to take your medicine on time. Set alarms for each dose and keep a log. This app is not a medical device and does not replace your doctor's advice.",
  };
  const run = (title: string, fields: Partial<MetadataDraft> = {}, sourceTitle = title) => {
    const src: MetadataDraft = { title: sourceTitle, subtitle: "", shortDescription, keywordField: "", description: desc };
    const proposal = cleanLocalizedProposal("android", {
      ...english,
      title,
      ...fields,
      targetKeywords: ["pill reminder", "medication alarm"],
      changes: [],
      notes: [],
    });
    return languageIssues("android", proposal, { sourceLocale: "es-ES", targetLocale: "en-US", source: src, brand: "", sourceKeywords });
  };
  const blocking = (title: string, fields: Partial<MetadataDraft> = {}) =>
    run(title, fields)
      .filter(isBlockingIssue)
      .map((i) => `${i.field}:${i.reason}`);

  const descriptive = [
    "Recordatorio De Medicamentos",
    "Recordatorio De Pastillas",
    "Alarma De Pastillas",
    "Pastillas Y Medicamentos",
    "Recordatorio De Pastillas Y Medicamentos",
    "Recordatorio Medicación",
    "Aviso Toma Medicación",
    "Toma Tu Medicación",
    "Pastillero Inteligente",
    "Mi Botiquín",
    "Recordar Medicinas",
  ];

  it.each(descriptive)("«%s» copied unchanged blocks and is not inferred as the name", (title) => {
    expect(blocking(title)).toEqual(["title:copied"]);
    expect(inferredAppName(title, keywordWords)).toBe("");
    expect(inferredAppName(title, keywordWords, nameContext({ title, subtitle: "", shortDescription, keywordField: "", description: desc }, "es"))).toBe("");
  });

  it("keyword titles with a separator still block, whatever their case", () => {
    for (const title of ["Recordatorio Pastillas: Alarma", "Recordatorio pastillas: alarma", "Recordatorio De Pastillas: Alarma"]) {
      expect(blocking(title)).toEqual(["title:copied"]);
    }
  });

  it("real names are still kept: a whole-title name and a brand at the head", () => {
    for (const title of ["Pill Buddy", "MediTrack"]) {
      expect(inferredAppName(title, keywordWords)).toBe(title);
      expect(run(title)).toEqual([]);
    }
    expect(inferredAppName("MyTherapy: Recordatorio Pastillas", keywordWords)).toBe("MyTherapy");
    expect(inferredAppName("Medisafe Recordatorio Pastillas", keywordWords)).toBe("Medisafe");
    expect(run("MyTherapy: Pill Reminder", {}, "MyTherapy: Recordatorio Pastillas")).toEqual([]);
    expect(run("Medisafe Pill Reminder", {}, "Medisafe Recordatorio Pastillas")).toEqual([]);
  });

  it("a name title does not exempt a copied short description or description, nor a Spanish proposal", () => {
    expect(blocking("Pill Buddy", { shortDescription })).toEqual(["shortDescription:copied"]);
    expect(blocking("Pill Buddy", { description: desc })).toEqual(["description:copied"]);
    expect(blocking("Pill Buddy: recordatorio", { shortDescription, description: desc })).toEqual([
      "title:copied",
      "shortDescription:copied",
      "description:copied",
    ]);
  });

  it("a Title Case word of the source vocabulary is not a proper noun («Medicinas»)", () => {
    const src: MetadataDraft = { title: "Recordar Medicinas", subtitle: "", shortDescription, keywordField: "", description: desc };
    const names = properNouns(src, keywordWords, nameContext(src, "es"));
    expect(names).not.toContain("medicinas");
    expect(names).not.toContain("medicacion");
    // Lower-case words of the product facts are ordinary words too.
    expect(inferredAppName("Pastillero Vital", keywordWords)).toBe("Pastillero Vital");
    expect(inferredAppName("Pastillero Vital", keywordWords, nameContext(src, "es", "Avisa de cada toma con una alarma vital"))).toBe("");
  });

  // Known gap: a descriptive title whose only unusual word is a plain word the listing never writes in
  // lower case looks exactly like «Pill Buddy» to the heuristic.
  it("documents the residual gap («Control Pastillas Diabetes»)", () => {
    expect(inferredAppName("Control Pastillas Diabetes", keywordWords)).toBe("Control Pastillas Diabetes");
  });
});
