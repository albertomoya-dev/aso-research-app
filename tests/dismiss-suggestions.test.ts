import { beforeEach, describe, expect, it, vi } from "vitest";
import { dismissedMessage, MAX_DISMISS, parseDismissRequest } from "@/lib/suggestions";

// H24: «Seleccionar todas» → «Descartar» left every idea pending. The action now gets the ids
// explicitly and reports how many it changed; these tests pin both parts.

const mocks = vi.hoisted(() => ({
  pending: new Set<number>(),
  updates: [] as { set: Record<string, unknown>; ids: number[] }[],
  revalidated: [] as string[],
  fail: false,
}));

vi.mock("next/cache", () => ({ revalidatePath: (path: string) => mocks.revalidated.push(path) }));
vi.mock("drizzle-orm", async (original) => {
  const actual = await original<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: (...parts: unknown[]) => parts,
    eq: () => null,
    inArray: (_column: unknown, ids: number[]) => ({ ids }),
  };
});
vi.mock("@/db", async () => ({
  schema: await import("@/db/schema"),
  getDb: () => ({
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: (parts: unknown[]) => ({
          returning: async () => {
            if (mocks.fail) throw new Error("connection reset");
            const { ids } = parts.find((p): p is { ids: number[] } => typeof p === "object" && p !== null && "ids" in p)!;
            mocks.updates.push({ set, ids });
            const changed = ids.filter((id) => mocks.pending.delete(id));
            return changed.map((id) => ({ id }));
          },
        }),
      }),
    }),
  }),
}));

const { dismissSuggestions } = await import("@/app/ai-actions");

describe("parseDismissRequest", () => {
  it("accepts numeric strings and drops repeated ids", () => {
    expect(parseDismissRequest("1", ["3", 3, "4"])).toEqual({ appId: 1, ids: [3, 4] });
  });

  it("asks for a selection when there is none", () => {
    expect(parseDismissRequest(1, [])).toEqual({ error: "Marca al menos una idea." });
  });

  it("rejects bad ids and oversized requests", () => {
    expect(parseDismissRequest(0, [1])).toHaveProperty("error");
    expect(parseDismissRequest(1, ["x"])).toHaveProperty("error");
    expect(parseDismissRequest(1, Array.from({ length: MAX_DISMISS + 1 }, (_, i) => i + 1))).toHaveProperty("error");
  });
});

describe("dismissedMessage", () => {
  it("says how many were dismissed", () => {
    expect(dismissedMessage(1)).toBe("1 idea descartada");
    expect(dismissedMessage(38)).toBe("38 ideas descartadas");
    expect(dismissedMessage(0)).toMatch(/ninguna/);
  });
});

describe("dismissSuggestions", () => {
  beforeEach(() => {
    mocks.pending = new Set(Array.from({ length: 38 }, (_, i) => i + 1));
    mocks.updates = [];
    mocks.revalidated = [];
    mocks.fail = false;
  });

  it("dismisses every selected idea in one update and reports the count", async () => {
    const all = [...mocks.pending];
    await expect(dismissSuggestions(1, all)).resolves.toEqual({ dismissed: 38 });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]).toEqual({ set: { status: "dismissed" }, ids: all });
    expect(mocks.pending.size).toBe(0);
    expect(mocks.revalidated).toEqual(["/apps/1/ideas"]);
  });

  it("counts only the ideas that were still pending", async () => {
    await dismissSuggestions(1, [1, 2]);
    await expect(dismissSuggestions(1, [2, 3])).resolves.toEqual({ dismissed: 1 });
  });

  it("returns an error instead of throwing when the database fails", async () => {
    mocks.fail = true;
    const result = await dismissSuggestions(1, [1]);
    expect(result.dismissed).toBe(0);
    expect(result.error).toMatch(/No se han podido descartar/);
    expect(mocks.revalidated).toEqual([]);
  });

  it("does not touch the database without a selection", async () => {
    await expect(dismissSuggestions(1, [])).resolves.toEqual({ dismissed: 0, error: "Marca al menos una idea." });
    expect(mocks.updates).toHaveLength(0);
  });
});
