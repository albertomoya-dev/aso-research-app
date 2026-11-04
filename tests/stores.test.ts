import { describe, expect, it, vi } from "vitest";
import type { IAppItemFullDetail } from "google-play-scraper";
import gplayApp from "./fixtures/gplay-app.json";
import itunesLookup from "./fixtures/itunes-lookup.json";
import { isEmptySuggestError, toMeta as androidMeta, toSummary as androidSummary } from "@/lib/stores/android";
import { looksLikeAppId } from "@/lib/stores";
import { toMeta as iosMeta, type ItunesApp } from "@/lib/stores/ios";
import { abortable, isRetryable, withRetry } from "@/lib/stores/retry";

describe("iOS adapter", () => {
  const app = itunesLookup.results[0] as ItunesApp;

  it("normalizes a lookup result", () => {
    const meta = iosMeta(app, "es");
    expect(meta).toMatchObject({
      store: "ios",
      id: "426826309",
      bundleId: "com.strava.stravaride",
      title: "Strava: Run, Bike, Hike",
      developer: "Strava Inc.",
      icon: app.artworkUrl512,
      rating: 4.80123,
      ratingsCount: 51234,
      category: "Health & Fitness",
      country: "es",
      shortDescription: null,
      screenshots: app.screenshotUrls,
    });
  });

  it("falls back to the 100px icon and empty fields", () => {
    const { artworkUrl512, averageUserRating, screenshotUrls, description, ...rest } = app;
    void [artworkUrl512, averageUserRating, screenshotUrls, description];
    const meta = iosMeta(rest, "mx");
    expect(meta.icon).toBe(app.artworkUrl100);
    expect(meta.rating).toBeNull();
    expect(meta.screenshots).toEqual([]);
    expect(meta.description).toBe("");
  });
});

describe("Android adapter", () => {
  const app = gplayApp as unknown as IAppItemFullDetail;

  it("normalizes an app detail", () => {
    const meta = androidMeta(app, "es");
    expect(meta).toMatchObject({
      store: "android",
      id: "com.strava",
      title: "Strava: correr y ciclismo",
      shortDescription: "Registra tus carreras y rutas en bici con GPS",
      ratingsCount: 812345,
      price: "Gratis",
      releaseNotes: "Corrección de errores.",
      updatedAt: "2025-10-14T16:00:00.000Z",
    });
  });

  it("treats a zero score as no rating", () => {
    expect(androidSummary({ ...app, score: 0 }).rating).toBeNull();
  });
});

describe("looksLikeAppId", () => {
  it.each([
    ["ios", "426826309", true],
    ["ios", "id426826309", true],
    ["ios", "strava", false],
    ["android", "com.strava", true],
    ["android", "strava running", false],
    ["android", "strava", false],
  ] as const)("%s %s → %s", (store, query, expected) => {
    expect(looksLikeAppId(store, query)).toBe(expected);
  });
});

describe("withRetry", () => {
  it("retries 429 and then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValueOnce("ok");
    await expect(withRetry(fn, 3, 1)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 404", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));
    await expect(withRetry(fn, 3, 1)).rejects.toThrow("not found");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("never retries an aborted request, and stops when its signal aborts", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    expect(isRetryable(timeout)).toBe(false);
    expect(isRetryable(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(false);

    const controller = new AbortController();
    const fn = vi.fn().mockImplementation(async () => {
      controller.abort(timeout);
      throw Object.assign(new Error("network"), { status: undefined });
    });
    await expect(withRetry(fn, 4, 1, controller.signal)).rejects.toBe(timeout);
    expect(fn).toHaveBeenCalledTimes(1);

    const never = vi.fn();
    await expect(withRetry(never, 4, 1, AbortSignal.abort(timeout))).rejects.toBe(timeout);
    expect(never).not.toHaveBeenCalled();
  });
});

describe("abortable", () => {
  it("stops waiting for a call that takes no signal when the signal aborts", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve("late"), 200));
    await expect(abortable(slow, AbortSignal.timeout(10))).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("passes the result through without a signal or before it aborts", async () => {
    await expect(abortable(Promise.resolve(1))).resolves.toBe(1);
    await expect(abortable(Promise.resolve(2), AbortSignal.timeout(1_000))).resolves.toBe(2);
    await expect(abortable(Promise.reject(new Error("boom")), new AbortController().signal)).rejects.toThrow("boom");
  });
});

describe("Android autocomplete", () => {
  it("treats the package's null-list crash as no suggestions", () => {
    let crash: unknown;
    try {
      (null as unknown as string[]).map((s) => s);
    } catch (error) {
      crash = error;
    }
    expect(isEmptySuggestError(crash)).toBe(true);
    expect(isEmptySuggestError(new Error("Response code 429"))).toBe(false);
  });
});
