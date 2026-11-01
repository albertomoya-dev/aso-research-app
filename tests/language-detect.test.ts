import { describe, expect, it } from "vitest";
import { detectLanguage, wrongLanguage } from "@/lib/language-detect";
import listing from "./fixtures/recordatorio/listing-v2.json";

describe("detectLanguage", () => {
  it("tells the store languages apart in listing texts", () => {
    expect(detectLanguage(listing.draft.description).lang).toBe("es");
    expect(detectLanguage("Never miss a dose: a simple pill reminder with alarms for all your medications.").lang).toBe("en");
    expect(detectLanguage("Nunca esqueça um remédio: lembrete de comprimidos com alarmes para todos os seus medicamentos.").lang).toBe("pt");
    expect(detectLanguage("N'oubliez plus vos médicaments : un rappel simple avec des alarmes pour chaque prise.").lang).toBe("fr");
    expect(detectLanguage("Vergiss nie wieder eine Tablette: eine einfache Erinnerung mit Alarm für alle deine Medikamente.").lang).toBe("de");
    expect(detectLanguage("Non dimenticare mai una pillola: un promemoria semplice con allarmi per tutti i tuoi farmaci.").lang).toBe("it");
  });

  it("tells when a field is not in the target language, even if it cannot say which one it is", () => {
    const short = listing.draft.shortDescription; // «Pastillero digital fácil: alarmas de medicamentos y control de tu tratamiento»
    expect(wrongLanguage(short, "en", { prefer: "es" })).toEqual({ found: "es" });
    expect(wrongLanguage(short, "es")).toBeNull();
    expect(wrongLanguage(listing.draft.description, "en")).toEqual({ found: "es" });
    expect(wrongLanguage("Never miss a dose: a simple pill reminder with alarms for all your medications.", "en")).toBeNull();
    expect(wrongLanguage("Never miss a dose: a simple pill reminder with alarms for all your medications.", "es")).toEqual({ found: "en" });
    // Too short to tell, or a language without a stopword list.
    expect(wrongLanguage("Recordatorio pastillas: alarma", "en")).toBeNull();
    expect(wrongLanguage(listing.draft.description, "ja")).toEqual({ found: "es" });
  });

  it("does not guess on a short title without function words", () => {
    expect(detectLanguage("Recordatorio pastillas: alarma").lang).toBeNull();
    expect(detectLanguage("Pill Reminder & Med Tracker").lang).toBeNull();
    expect(detectLanguage("").lang).toBeNull();
  });

  it("ignores the brand", () => {
    // «Los Pollos» would read as Spanish; without it the text is English.
    const text = "Los Pollos: track your meals and your water with the simplest diary";
    expect(detectLanguage(text, ["Los Pollos"]).lang).toBe("en");
  });
});
