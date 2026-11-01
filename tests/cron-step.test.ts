import { describe, expect, it } from "vitest";
import {
  CRON_HARD_CAP_MS,
  CRON_MAX_MS,
  cronBudget,
  OWN_LISTINGS_STOP_AT_MS,
  POPULARITY_STOP_AT_MS,
  RELEVANCE_CALL_TIMEOUT_MS,
  RELEVANCE_STOP_AT_MS,
  runStep,
} from "@/lib/cron-step";

describe("runStep", () => {
  it("returns the value or the error, so one failing step does not stop the next ones", async () => {
    expect(await runStep(async () => 3)).toEqual({ ok: true, value: 3 });
    expect(await runStep(async () => Promise.reject(new Error("Sin conexión")))).toEqual({ ok: false, error: "Sin conexión" });
    expect(await runStep(() => Promise.reject("raro"))).toEqual({ ok: false, error: "raro" });
  });
});

describe("cronBudget", () => {
  const start = Date.UTC(2026, 10, 1, 6);

  it("measures every deadline from the start of the route", () => {
    const budget = cronBudget(start, start);
    expect(budget.popularityDeadline).toBe(start + POPULARITY_STOP_AT_MS);
    expect(budget.relevanceDeadline).toBe(start + RELEVANCE_STOP_AT_MS);
    expect(budget.ownListingsDeadline).toBe(start + OWN_LISTINGS_STOP_AT_MS);
    expect(budget.relevanceCall).toMatchObject({ timeoutMs: RELEVANCE_CALL_TIMEOUT_MS, maxRetries: 0 });
    expect(budget.relevanceCall.signal.aborted).toBe(false);
  });

  it("runs own listings before relevance, and lets a relevance call end before the platform kills the job", () => {
    const budget = cronBudget(start, start);
    expect(budget.popularityDeadline).toBeLessThan(budget.ownListingsDeadline);
    expect(budget.ownListingsDeadline).toBeLessThan(budget.relevanceDeadline);
    expect(RELEVANCE_STOP_AT_MS).toBeLessThanOrEqual(240_000);
    expect(budget.relevanceDeadline + RELEVANCE_CALL_TIMEOUT_MS).toBeLessThanOrEqual(start + 280_000);
    expect(CRON_HARD_CAP_MS).toBeLessThan(CRON_MAX_MS);
  });

  it("aborts the Claude calls at the hard cap, counted from the start", () => {
    // The route started long ago: the cap has passed and the signal is already aborted.
    expect(cronBudget(start, start + CRON_HARD_CAP_MS + 1).relevanceCall.signal.aborted).toBe(true);
  });
});

describe("abortedByTimeout", () => {
  it("tells the hard cap (a timeout) from a cancelled request", async () => {
    const { abortedByTimeout } = await import("@/lib/claude");
    expect(abortedByTimeout(undefined)).toBe(false);
    expect(abortedByTimeout(new AbortController().signal)).toBe(false);
    expect(abortedByTimeout(cronBudget(0, CRON_HARD_CAP_MS).relevanceCall.signal)).toBe(true);
    const cancelled = new AbortController();
    cancelled.abort();
    expect(abortedByTimeout(cancelled.signal)).toBe(false);
  });
});
