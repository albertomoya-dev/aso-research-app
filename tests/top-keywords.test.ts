import { describe, expect, it } from "vitest";
import { stopwordsFor } from "@/lib/stopwords";
import { extractTopTerms, phrases, toCsv, type TopListing } from "@/lib/top-keywords";

const listing = (id: string, title: string, description = "", short = ""): TopListing => ({ id, title, short, description });

describe("phrases", () => {
  const stop = stopwordsFor("es");

  it("builds 1–3 word phrases that do not start or end with a stopword", () => {
    const keys = phrases("Plan de entrenamiento para correr", stop).map((p) => p.key);
    expect(keys).toContain("plan");
    expect(keys).toContain("plan de entrenamiento");
    expect(keys).toContain("entrenamiento");
    expect(keys).not.toContain("de entrenamiento");
    expect(keys).not.toContain("entrenamiento para");
    expect(keys).not.toContain("plan de entrenamiento para");
  });

  it("does not cross punctuation and folds accents in the key", () => {
    const result = phrases("Música relajante. Dormir mejor", stop);
    expect(result.map((p) => p.key)).not.toContain("relajante dormir");
    expect(result.find((p) => p.key === "musica")?.display).toBe("música");
  });

  it("skips numbers and very short words", () => {
    expect(phrases("5 km en 30 minutos", stop).map((p) => p.key)).toEqual(["minutos"]);
  });
});

describe("extractTopTerms", () => {
  const listings = [
    listing("a", "Runtastic: correr y caminar", "App para correr. Plan de entrenamiento para correr 5k."),
    listing("b", "Correr - plan de entrenamiento", "Contador de pasos y plan de entrenamiento."),
    listing("c", "Strava", "Registra tus carreras y salidas en bici.", "Correr, caminar y bici"),
  ];

  it("counts each term once per app and keeps only shared terms", () => {
    const terms = extractTopTerms(listings, { lang: "es" });
    const correr = terms.find((t) => t.term === "correr")!;
    expect(correr.apps).toBe(3);
    expect(correr.inTitle).toBe(2);
    expect(correr.inShort).toBe(1);
    expect(correr.occurrences).toBe(5);
    expect(terms.find((t) => t.term === "strava")).toBeUndefined();
    expect(terms.find((t) => t.term === "runtastic")).toBeUndefined();
  });

  it("ranks title use above description use", () => {
    const terms = extractTopTerms(listings, { lang: "es" });
    expect(terms[0].term).toBe("correr");
  });

  it("drops a word that only appears inside a longer shared phrase", () => {
    const terms = extractTopTerms([listing("a", "Ruido blanco"), listing("b", "Ruido blanco para dormir")], { lang: "es" });
    expect(terms.map((t) => t.term)).toContain("ruido blanco");
    expect(terms.map((t) => t.term)).not.toContain("blanco");
    expect(terms.map((t) => t.term)).not.toContain("ruido");
  });

  it("never outputs filler words or web leftovers from the descriptions (audit H3)", () => {
    const description =
      "Además, ahora puedes configurar tus alarmas de pastillas. Debe estar disponible en cualquier móvil, etc. Más datos en www.ejemplo.com. Después, la experiencia mejora.";
    const terms = extractTopTerms(
      [listing("a", "Recordatorio pastillas", description), listing("b", "Pastillas: recordatorio", description), listing("c", "Alarma pastillas", description)],
      { lang: "es" },
    ).map((t) => t.term);
    for (const noise of ["además", "ahora", "puedes", "etc", "com", "www", "debe", "disponible", "cualquier", "datos", "después", "experiencia", "configurar"]) {
      expect(terms, noise).not.toContain(noise);
    }
    expect(terms).toContain("pastillas");
    expect(terms).toContain("alarmas de pastillas");
  });

  it("keeps generic words inside a longer phrase", () => {
    const terms = extractTopTerms([listing("a", "", "Copia de datos segura."), listing("b", "", "Copia de datos segura.")], { lang: "es" }).map((t) => t.term);
    expect(terms).toContain("copia de datos");
    expect(terms).not.toContain("datos");
  });

  it("leaves out the searched keyword", () => {
    const terms = extractTopTerms(listings, { lang: "es", exclude: ["Correr"] });
    expect(terms.find((t) => t.term === "correr")).toBeUndefined();
  });
});

describe("toCsv", () => {
  it("writes a header and quotes cells that need it", () => {
    const csv = toCsv(
      [{ term: "correr", words: 1, apps: 2, inTitle: 1, inShort: 0, occurrences: 3, appIds: ["a", "b"], score: 4 }],
      10,
      { a: "Run, fast", b: "B" },
    );
    const [header, row] = csv.split("\n");
    expect(header).toContain("apps (de 10)");
    expect(row).toBe('correr,1,4,2,1,0,3,"Run, fast | B"');
  });
});
