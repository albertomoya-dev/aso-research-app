import { describe, expect, it } from "vitest";
import { clearOperation, getOperations, startOperation, stepIndex } from "@/lib/long-operations";
import { aiFeatureNotice, compareVersions, type ProductFeature } from "@/lib/product-facts";

const feature = (status: ProductFeature["status"], sinceVersion: string | null, advertise = true): ProductFeature => ({
  name: `${status}-${sinceVersion}`,
  summary: "",
  status,
  sinceVersion,
  advertise,
});

describe("compareVersions", () => {
  it("compares dotted versions as numbers", () => {
    expect(compareVersions("3.10.0", "3.9.2")).toBeGreaterThan(0);
    expect(compareVersions("2.4", "2.4.0")).toBe(0);
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
  });
});

describe("aiFeatureNotice", () => {
  it("counts what the AI announces and how many come from the newest version", () => {
    const notice = aiFeatureNotice([
      feature("shipped", "3.0.0"),
      feature("shipped", "3.0.0"),
      feature("shipped", "2.4.0"),
      feature("shipped", null),
      feature("shipped", "3.1.0", false),
      feature("next_release", "3.1.0"),
      feature("planned", null),
      feature("retired", "1.0.0"),
    ]);
    expect(notice).toEqual({ announced: 4, latestVersion: "3.0.0", fromLatest: 2, next: 1 });
  });

  it("has no version when no announced feature has one", () => {
    expect(aiFeatureNotice([feature("shipped", null), feature("planned", "9.0")])).toEqual({ announced: 1, latestVersion: null, fromLatest: 0, next: 0 });
  });
});

describe("long operations", () => {
  it("shows the steps one after another and keeps the last until the end", () => {
    expect(stepIndex(3, 8000, 0)).toBe(0);
    expect(stepIndex(3, 8000, 8000)).toBe(1);
    expect(stepIndex(3, 8000, 60_000)).toBe(2);
    expect(stepIndex(0, 8000, 1000)).toBe(-1);
  });

  it("keeps the result under its key, runs once at a time and reports `{ error }`", async () => {
    let calls = 0;
    let resolve!: (v: { error?: string }) => void;
    const run = () => {
      calls++;
      return new Promise<{ error?: string }>((r) => (resolve = r));
    };
    const options = { label: "Probando", doneLabel: "Listo", steps: ["Uno…", "Dos…"] };
    startOperation("test:1", options, run);
    startOperation("test:1", options, run);
    expect(calls).toBe(1);
    expect(getOperations().find((o) => o.key === "test:1")?.status).toBe("running");
    resolve({ error: "Falló" });
    await new Promise((r) => setTimeout(r, 0));
    const op = getOperations().find((o) => o.key === "test:1");
    expect(op?.status).toBe("error");
    expect(op?.error).toBe("Falló");
    expect(op?.state).toEqual({ error: "Falló" });
    clearOperation("test:1");
    expect(getOperations().some((o) => o.key === "test:1")).toBe(false);
  });

  it("computes the finish message from the result", async () => {
    startOperation("test:2", { label: "Recalculando", doneLabel: (r: { rated: number }) => `${r.rated} valoradas`, steps: [] }, async () => ({ rated: 12 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(getOperations().find((o) => o.key === "test:2")?.doneLabel).toBe("12 valoradas");
  });
});
