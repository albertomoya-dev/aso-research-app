import { describe, expect, it } from "vitest";
import {
  buildChangelogPrompt,
  type ChangelogOutput,
  cleanChangelogProposal,
  EMPTY_FACTS,
  factsFormSchema,
  factsForPrompt,
  featuresFor,
  hasProductFacts,
  type ProductFeature,
  splitList,
  splitLines,
} from "@/lib/product-facts";
import product from "./fixtures/recordatorio/product.json";

const features = product.features as ProductFeature[];
const feature = (name: string, o: Partial<ProductFeature> = {}): ProductFeature => ({
  name,
  summary: "",
  status: "shipped",
  sinceVersion: null,
  advertise: true,
  ...o,
});

const splitDoNot = (block: string) => {
  const lines = block.split("\n");
  return {
    doNot: lines.filter((l) => l.startsWith("Do NOT mention")).join("\n"),
    rest: lines.filter((l) => !l.startsWith("Do NOT mention")).join("\n"),
  };
};

describe("featuresFor", () => {
  it("keeps shipped always, next_release only for the next version, never planned or retired", () => {
    const list = [
      feature("a"),
      feature("b", { status: "next_release" }),
      feature("c", { status: "planned" }),
      feature("d", { status: "retired" }),
      feature("e", { advertise: false }),
    ];
    expect(featuresFor(list, "published").map((f) => f.name)).toEqual(["a"]);
    expect(featuresFor(list, "next").map((f) => f.name)).toEqual(["a", "b"]);
  });
});

describe("factsForPrompt", () => {
  it("returns null when the owner has not written anything", () => {
    expect(factsForPrompt(null, [], "next")).toBeNull();
    expect(factsForPrompt(EMPTY_FACTS, [], "next")).toBeNull();
    expect(hasProductFacts({ ...EMPTY_FACTS, pitch: "  " }, [])).toBe(false);
    expect(hasProductFacts(EMPTY_FACTS, [feature("a", { status: "planned" })])).toBe(true);
  });

  it("with the real case, the next version mentions the barcode scan and lists retired or planned features only as do-not-mention", () => {
    const block = factsForPrompt(product.facts, features, "next")!;
    const { doNot, rest } = splitDoNot(block);
    expect(block).toContain("PRODUCT FACTS");
    expect(block).toContain("código de barras");
    expect(block).toContain("Informe PDF para el médico");
    expect(block).toContain("Alarmas exactas");
    expect(doNot).toContain("Protección contra doble toma");
    expect(doNot).toContain("Modo cuidador");
    expect(doNot).not.toContain("Alarmas exactas");
    expect(rest).not.toContain("doble toma");
    expect(rest).not.toContain("Modo cuidador");
    expect(block).toContain("No hacer afirmaciones médicas");
    expect(block).toContain("no sustituye el consejo médico");
    expect(block).toContain("Languages the app supports: español, inglés");
  });

  it("for the published version, leaves out next_release features", () => {
    const block = factsForPrompt(product.facts, features, "published")!;
    expect(block).toContain("Alarmas exactas");
    expect(block).not.toContain("código de barras");
    expect(block).not.toContain("Features of the next version");
    expect(splitDoNot(block).rest).not.toContain("doble toma");
    expect(splitDoNot(block).doNot).toContain("doble toma");
    expect(block).toContain("the version published in the store");
  });

  it("says to rely on the listing when no feature fits the version", () => {
    const block = factsForPrompt({ ...EMPTY_FACTS, pitch: "Un pastillero" }, [feature("x", { status: "next_release" })], "published")!;
    expect(block).toContain("What it is: Un pastillero");
    expect(block).toContain("rely only on the current listing");
    expect(block).not.toContain("Never promise features that are not listed here");
  });

  it("leaves features the owner does not advertise out entirely, even retired ones", () => {
    const block = factsForPrompt(EMPTY_FACTS, [feature("a"), feature("interna", { advertise: false }), feature("vieja", { status: "retired", advertise: false })], "next")!;
    expect(block).not.toContain("interna");
    expect(block).not.toContain("vieja");
    expect(block).not.toContain("Do NOT mention");
  });
});

describe("form input", () => {
  it("splits lists and drops blanks, bullets and repeats", () => {
    expect(splitLines("- uno\n\n• dos\nuno\r\n  tres ")).toEqual(["uno", "dos", "tres"]);
    expect(splitList("español, inglés,\nespañol")).toEqual(["español", "inglés"]);
    const parsed = factsFormSchema.parse({ pitch: " Hola ", audience: "", differentiators: "a\nb", constraints: "", tone: "", languages: "es, en" });
    expect(parsed).toEqual({ pitch: "Hola", audience: "", differentiators: ["a", "b"], constraints: [], tone: "", languages: ["es", "en"] });
  });
});

describe("CHANGELOG import", () => {
  const existing = [
    { id: 1, name: "Alarmas exactas", summary: "Suenan con la app cerrada", status: "shipped" as const, sinceVersion: "1.0" },
    { id: 2, name: "Protección contra doble toma", summary: "Avisa en 4 horas", status: "shipped" as const, sinceVersion: "2.0" },
  ];
  const output = (o: Partial<ChangelogOutput>): ChangelogOutput => ({ features: [], releases: [], notes: [], ...o });
  const item = (name: string, o: Partial<ChangelogOutput["features"][number]> = {}) => ({
    name,
    summary: "",
    status: "shipped" as const,
    sinceVersion: "",
    updates: "",
    ...o,
  });

  it("puts the published version and the existing features in the prompt", () => {
    const prompt = buildChangelogPrompt("## 3.0\n- Escáner", { appTitle: "Recordatorio", publishedVersion: "2.4.0", existing });
    expect(prompt).toContain("Version published in the store: 2.4.0");
    expect(prompt).toContain("- Protección contra doble toma | shipped | since 2.0");
    expect(prompt).toContain("## 3.0\n- Escáner");
  });

  it("matches existing features, skips no-op updates and repeats, and cleans releases", () => {
    const proposal = cleanChangelogProposal(
      output({
        features: [
          item("Escanear el código de barras", { status: "next_release", sinceVersion: "3.0" }),
          item("escanear el codigo de barras", { status: "next_release" }),
          item("Doble toma", { status: "retired", updates: "Protección contra doble toma" }),
          item("Alarmas exactas", { summary: "Suenan con la app cerrada" }),
          item("  ", { summary: "sin nombre" }),
        ],
        releases: [
          { version: "3.0", date: "2026-11-02", notes: "Escáner" },
          { version: "3.0", date: "", notes: "repetida" },
          { version: "2.4.0", date: "ayer", notes: "" },
        ],
        notes: [" Revisa la 3.0 ", ""],
      }),
      existing,
    );
    expect(proposal.features).toEqual([
      { name: "Escanear el código de barras", summary: "", status: "next_release", sinceVersion: "3.0", advertise: true, existingId: null },
      { name: "Protección contra doble toma", summary: "Avisa en 4 horas", status: "retired", sinceVersion: "2.0", advertise: true, existingId: 2 },
    ]);
    expect(proposal.releases).toEqual([
      { version: "3.0", date: "2026-11-02", notes: "Escáner" },
      { version: "2.4.0", date: null, notes: "" },
    ]);
    expect(proposal.notes).toEqual(["Revisa la 3.0"]);
  });
});
