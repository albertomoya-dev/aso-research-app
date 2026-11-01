import { beforeEach, describe, expect, it, vi } from "vitest";
import { chunk, countProgress, isUnrated, NEW_KEYWORDS_BATCH_SIZE, RELEVANCE_PENDING_MS, relevanceProgress } from "@/lib/relevance";

const mocks = vi.hoisted(() => ({
  rateRelevance: vi.fn(),
  hasKey: vi.fn(() => true),
  rows: [] as { id: number; term: string; relevance: number | null; relevanceSource: "ai" | "user" | null; top5: [] }[],
  sets: [] as Record<string, unknown>[],
  unrated: [] as { appId: number; keywordId: number }[],
}));

vi.mock("@/lib/claude", () => ({
  AiError: class AiError extends Error {},
  hasAnthropicKey: mocks.hasKey,
  rateRelevance: mocks.rateRelevance,
}));
vi.mock("@/lib/queries", () => ({ getKeywordRows: async () => mocks.rows }));
vi.mock("@/lib/product-queries", () => ({ productFactsPrompt: async () => null }));
vi.mock("@/db", () => ({
  schema: { appKeywords: {}, apps: {} },
  getDb: () => ({
    select: () => ({
      from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => mocks.unrated }) }) }),
    }),
    query: { apps: { findFirst: async () => app } },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          mocks.sets.push(values);
        },
      }),
    }),
  }),
}));
vi.mock("drizzle-orm", async (original) => {
  const actual = await original<typeof import("drizzle-orm")>();
  const noop = () => ({});
  return { ...actual, and: noop, eq: noop, inArray: noop, isNull: noop, ne: noop, or: noop };
});

const { omittedIds, rateAppKeywords, rateNewKeywords, rateUnratedKeywords } = await import("@/lib/relevance-jobs");

const app = {
  id: 1,
  storeId: "com.example",
  store: "android",
  country: "es",
  meta: { title: "App", developer: "Dev", category: null, shortDescription: "", description: "" },
} as unknown as Parameters<typeof rateAppKeywords>[0];

describe("relevanceProgress", () => {
  const now = Date.UTC(2026, 10, 1, 12);
  const base = { relevance: null, relevanceSource: null, relevanceCheckedAt: null, createdAt: new Date(now - 60_000) };

  it("is «set» when the keyword has a relevance or the user touched it", () => {
    expect(relevanceProgress({ ...base, relevance: 4, relevanceSource: "ai" }, true, now)).toBe("set");
    expect(relevanceProgress({ ...base, relevanceSource: "user" }, true, now)).toBe("set");
  });

  it("is «off» without an API key", () => {
    expect(relevanceProgress(base, false, now)).toBe("off");
  });

  it("is «calculating» for the first minutes after adding it", () => {
    expect(relevanceProgress(base, true, now)).toBe("calculating");
    expect(relevanceProgress({ ...base, createdAt: new Date(now - RELEVANCE_PENDING_MS - 1) }, true, now)).toBe("queued");
  });

  it("is «failed» once a request for it failed", () => {
    expect(relevanceProgress({ ...base, relevanceCheckedAt: new Date(now) }, true, now)).toBe("failed");
  });

  it("counts each state", () => {
    expect(countProgress(["set", "calculating", "calculating", "off"])).toEqual({ set: 1, calculating: 2, failed: 0, queued: 0, off: 1 });
  });

  it("treats only keywords without relevance and source as unrated", () => {
    expect(isUnrated({ relevance: null, relevanceSource: null })).toBe(true);
    expect(isUnrated({ relevance: null, relevanceSource: "user" })).toBe(false);
  });
});

describe("batching keywords just added", () => {
  it("splits 29 keywords in batches of at most 10", () => {
    const batches = chunk(Array.from({ length: 29 }, (_, i) => i), NEW_KEYWORDS_BATCH_SIZE);
    expect(batches.map((b) => b.length)).toEqual([10, 10, 9]);
  });
});

describe("rateAppKeywords", () => {
  beforeEach(() => {
    mocks.rateRelevance.mockReset();
    mocks.hasKey.mockReturnValue(true);
    mocks.sets.length = 0;
    mocks.rows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, term: `kw ${i + 1}`, relevance: null, relevanceSource: null, top5: [] }));
  });

  const answer = (items: { term: string }[]) => ({
    output: { ratings: items.map((i) => ({ term: i.term, relevance: 4, intent: "own", reason: "" })) },
  });

  it("asks in batches of 10 and stores every batch that answers, even when one fails", async () => {
    let call = 0;
    mocks.rateRelevance.mockImplementation(async (_context: unknown, items: { term: string }[]) => {
      if (call++ === 1) throw new Error("boom");
      return answer(items);
    });
    const report = await rateAppKeywords(app, { batchSize: NEW_KEYWORDS_BATCH_SIZE });
    expect(mocks.rateRelevance).toHaveBeenCalledTimes(3);
    expect(report).toMatchObject({ asked: 30, rated: 20 });
    expect(report.error).toBeTruthy();
    expect(mocks.sets.filter((s) => s.relevance === 4)).toHaveLength(20);
    // The failed batch leaves a trace so the table says why.
    expect(mocks.sets.filter((s) => !("relevance" in s) && s.relevanceCheckedAt instanceof Date)).toHaveLength(1);
  });

  it("stamps the keywords the model leaves out, so they are not «pendiente» forever", async () => {
    mocks.rows = mocks.rows.slice(0, 10);
    // The model answers 7 of 10.
    mocks.rateRelevance.mockImplementation(async (_c: unknown, items: { term: string }[]) => answer(items.slice(0, 7)));
    const report = await rateAppKeywords(app, { batchSize: 10 });
    expect(report).toMatchObject({ asked: 10, rated: 7 });
    expect(report.error).toBeUndefined();
    expect(mocks.sets.filter((s) => s.relevance === 4)).toHaveLength(7);
    // One stamp (relevance_checked_at only) for the 3 omitted ones.
    expect(mocks.sets.filter((s) => !("relevance" in s) && s.relevanceCheckedAt instanceof Date)).toHaveLength(1);
  });

  it("does not stamp anything extra when the model answers every keyword", async () => {
    mocks.rows = mocks.rows.slice(0, 10);
    mocks.rateRelevance.mockImplementation(async (_c: unknown, items: { term: string }[]) => answer(items));
    await rateAppKeywords(app, { batchSize: 10 });
    expect(mocks.sets.filter((s) => !("relevance" in s))).toHaveLength(0);
  });

  it("passes the per-request options to Claude", async () => {
    mocks.rows = mocks.rows.slice(0, 10);
    mocks.rateRelevance.mockImplementation(async (_c: unknown, items: { term: string }[]) => answer(items));
    await rateAppKeywords(app, { batchSize: 10, request: { timeoutMs: 40_000, maxRetries: 0 } });
    expect(mocks.rateRelevance).toHaveBeenCalledWith(expect.anything(), expect.any(Array), { timeoutMs: 40_000, maxRetries: 0 });
  });

  it("skips the batches not started before the deadline", async () => {
    mocks.rateRelevance.mockImplementation(async (_c: unknown, items: { term: string }[]) => answer(items));
    const report = await rateAppKeywords(app, { batchSize: 10, deadline: Date.now() - 1 });
    expect(mocks.rateRelevance).not.toHaveBeenCalled();
    expect(report).toMatchObject({ rated: 0, asked: 30, skipped: 30 });
  });
});

describe("omittedIds", () => {
  it("lists the keywords of a batch without an answer", () => {
    expect(omittedIds([{ id: 1 }, { id: 2 }, { id: 3 }], [{ id: 2 }])).toEqual([1, 3]);
    expect(omittedIds([{ id: 1 }], [{ id: 1 }])).toEqual([]);
  });
});

describe("rateUnratedKeywords", () => {
  beforeEach(() => {
    mocks.rateRelevance.mockReset();
    mocks.hasKey.mockReturnValue(true);
    mocks.sets.length = 0;
    mocks.rows = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, term: `kw ${i + 1}`, relevance: null, relevanceSource: null, top5: [] }));
    mocks.unrated = mocks.rows.map((r) => ({ appId: 1, keywordId: r.id }));
  });

  it("rates in batches of 10 with the cron's request options", async () => {
    mocks.rateRelevance.mockImplementation(async (_c: unknown, items: { term: string }[]) => ({
      output: { ratings: items.map((i) => ({ term: i.term, relevance: 3, intent: "own", reason: "" })) },
    }));
    const report = await rateUnratedKeywords({ request: { timeoutMs: 40_000, maxRetries: 0 } });
    expect(report).toEqual({ apps: 1, asked: 20, rated: 20, skipped: 0, errors: [] });
    expect(mocks.rateRelevance).toHaveBeenCalledTimes(2);
    for (const call of mocks.rateRelevance.mock.calls) expect(call[2]).toEqual({ timeoutMs: 40_000, maxRetries: 0 });
  });

  it("starts nothing once the deadline has passed", async () => {
    const report = await rateUnratedKeywords({ deadline: Date.now() - 1 });
    expect(mocks.rateRelevance).not.toHaveBeenCalled();
    expect(report).toMatchObject({ rated: 0, skipped: 20 });
  });

  it("is «off» without an API key", async () => {
    mocks.hasKey.mockReturnValue(false);
    expect(await rateUnratedKeywords()).toBe("off");
  });
});

describe("rateNewKeywords", () => {
  it("says «none» when nothing was added and «off» without an API key", async () => {
    expect(await rateNewKeywords(1, [])).toBe("none");
    mocks.hasKey.mockReturnValue(false);
    expect(await rateNewKeywords(1, [1])).toBe("off");
  });
});
