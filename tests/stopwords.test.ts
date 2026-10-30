import { describe, expect, it } from "vitest";
import { genericWordsFor, isNoiseTerm, isStopword, stopwordsFor } from "@/lib/stopwords";
import { fold } from "@/lib/text";

describe("fold", () => {
  it("drops accents and lowers case, keeping the spacing", () => {
    expect(fold("Además  ÁRBOL ñandú")).toBe("ademas  arbol nandu");
  });
});

describe("stopwordsFor", () => {
  it("covers adverbs, modal verbs and web leftovers in Spanish, plus English everywhere", () => {
    const stop = stopwordsFor("es");
    for (const w of ["ademas", "ahora", "puedes", "puede", "debe", "deben", "tienes", "despues", "cualquier", "ejemplo", "etc", "com", "www", "the", "your"]) {
      expect(stop.has(w), w).toBe(true);
    }
  });

  it("has lists for the six store languages, written without accents", () => {
    for (const [lang, word] of [["en", "should"], ["pt", "voce"], ["fr", "peut"], ["de", "konnen"], ["it", "perche"]] as const) {
      expect(stopwordsFor(lang).has(word), `${lang}: ${word}`).toBe(true);
    }
    for (const lang of ["es", "en", "pt", "fr", "de", "it"]) {
      for (const w of [...stopwordsFor(lang), ...genericWordsFor(lang)]) expect(w).toBe(fold(w));
    }
  });

  it("keeps real keyword words out of the lists", () => {
    for (const w of ["correr", "pastillas", "recordatorio", "alarma", "medicamentos", "plan", "musica"]) {
      expect(isStopword(w, "es"), w).toBe(false);
      expect(genericWordsFor("es").has(w), w).toBe(false);
    }
  });
});

describe("isStopword / isNoiseTerm", () => {
  it("folds before looking up", () => {
    expect(isStopword("Además", "es")).toBe(true);
    expect(isStopword(" Después ", "es")).toBe(true);
  });

  it("flags filler single words, numbers and phrases made only of filler", () => {
    for (const t of ["ademas", "puedes", "etc", "com", "datos", "configurar", "experiencia", "botones", "acceso", "2024", "ahora mismo", "por ejemplo"]) {
      expect(isNoiseTerm(t, "es"), t).toBe(true);
    }
  });

  it("lets through any phrase with one real word", () => {
    for (const t of ["recordatorio pastillas", "copia de seguridad de datos", "app pastillas", "control de medicación", "alarma"]) {
      expect(isNoiseTerm(t, "es"), t).toBe(false);
    }
  });
});
