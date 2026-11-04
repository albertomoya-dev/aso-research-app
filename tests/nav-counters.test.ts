import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { marketCounterRows, toMarketCounters } from "@/lib/nav-queries";
import { pendingCandidatesSql } from "@/lib/candidate-queries";
import { type Candidate, mergeCandidates, storedCandidates, type CandidateRow } from "@/lib/candidates";
import { normalizeKeyword } from "@/lib/keywords";
import { countNewReviewSources, jsonValue, listingWarningCount } from "@/lib/nav-counters";
import { policyCheck } from "@/lib/policy-check";
import type { AppMeta } from "@/lib/stores/types";

// Sidebar counters of an app (REDISENO §5): Encontrar's «Pendientes», «Reseñas · N nuevas» and
// «Ficha · N avisos».

const meta = (over: Partial<AppMeta> = {}): AppMeta => ({
  store: "android",
  id: "com.moyalogames.recordatorio",
  title: "Recordatorio de pastillas",
  developer: "Moya",
  icon: "icon",
  rating: 4.5,
  url: "u",
  country: "es",
  bundleId: "com.moyalogames.recordatorio",
  category: "Medicina",
  ratingsCount: 10,
  price: "Gratis",
  version: "1.0",
  updatedAt: null,
  shortDescription: "Te avisa de tus pastillas a su hora",
  description: "Una app sencilla para recordar la medicación de cada día.",
  releaseNotes: null,
  screenshots: [],
  ...over,
});

describe("countNewReviewSources", () => {
  it("counts the sources with the Reseñas dot: a review newer than the last analysis", () => {
    expect(
      countNewReviewSources([
        { latest: "2026-11-02T08:00:00+00:00", to: "2026-11-01T10:00:00.000Z" },
        { latest: "2026-10-30T00:00:00+00:00", to: "2026-11-01T10:00:00.000Z" },
        // The analysis found no reviews: any review is new.
        { latest: "2026-11-02T08:00:00+00:00", to: null },
        { latest: null, to: null },
      ]),
    ).toBe(2);
    expect(countNewReviewSources([])).toBe(0);
  });
});

describe("listingWarningCount", () => {
  it("counts the errors and warnings of the main language's draft when there is one", () => {
    const draft = { title: "Pastillas 💊 GRATIS", subtitle: "", keywordField: "", shortDescription: "", description: "" };
    const expected = policyCheck("android", draft, { lang: "es", category: "Medicina", keywords: [] }).filter((i) => i.level !== "info").length;
    expect(expected).toBeGreaterThan(0);
    expect(listingWarningCount({ store: "android", country: "es", meta: meta(), drafts: [{ locale: "es-ES", draft }], keywords: [] })).toBe(expected);
  });

  it("uses the published listing without a draft of the main language, and never counts info notes", () => {
    const clean = listingWarningCount({ store: "android", country: "es", meta: meta(), drafts: [], keywords: [] });
    // A draft of another language does not count for this market.
    const other = { title: "Pastillas 💊 GRATIS", subtitle: "", keywordField: "", shortDescription: "", description: "" };
    expect(listingWarningCount({ store: "android", country: "es", meta: meta(), drafts: [{ locale: "en-US", draft: other }], keywords: [] })).toBe(clean);
    const published = { title: meta().title, subtitle: "", keywordField: "", shortDescription: meta().shortDescription!, description: meta().description };
    const issues = policyCheck("android", published, { lang: "es", category: "Medicina", keywords: [] });
    expect(clean).toBe(issues.filter((i) => i.level === "error" || i.level === "warn").length);
    expect(listingWarningCount({ store: "android", country: "es", meta: meta({ title: "Pastillas 💊" }), drafts: [], keywords: [] })).toBeGreaterThan(clean);
  });
});

describe("jsonValue", () => {
  it("accepts parsed json, a json string, or falls back", () => {
    expect(jsonValue([1], [])).toEqual([1]);
    expect(jsonValue("[2]", [])).toEqual([2]);
    expect(jsonValue("{nope", [])).toEqual([]);
    expect(jsonValue(null, ["x"])).toEqual(["x"]);
  });
});

// The «Pendientes» count of the sidebar, run on a real Postgres (PGlite with every migration), against
// the tray Encontrar shows (mergeCandidates over the same rows).
const dir = join(process.cwd(), "db", "migrations");
const journal = JSON.parse(readFileSync(join(dir, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };

describe("pendingCandidatesSql", () => {
  const db = new PGlite();
  const dialect = new PgDialect();

  beforeAll(async () => {
    for (const { tag } of journal.entries) {
      for (const statement of readFileSync(join(dir, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) {
        if (statement.trim()) await db.exec(statement);
      }
    }
    const metaJson = JSON.stringify(meta()).replace(/'/g, "''");
    await db.exec(`
      INSERT INTO products (id, store, store_id, slug, title, icon) VALUES (1, 'android', 'com.x', 'x', 'X', 'i');
      INSERT INTO apps (id, product_id, store, store_id, country, title, developer, icon, url, meta) VALUES
        (1, 1, 'android', 'com.x', 'es', 'X', 'Moya', 'i', 'u', '${metaJson}'),
        (2, 1, 'android', 'com.x', 'us', 'X', 'Moya', 'i', 'u', '${metaJson}');
      INSERT INTO keywords (id, term) VALUES (1, 'pastillero'), (2, 'alarma');
      INSERT INTO app_keywords (app_id, keyword_id) VALUES (1, 1), (2, 2);
      INSERT INTO ai_suggestions (app_id, term, language, intent, relevance, estimated_competition, reason, status, model, prompt_version) VALUES
        (1, 'Recordar  Pastillas', 'es', 'i', 4, 'low', 'r', 'pending', 'm', 'v1'),
        (1, 'pastillero', 'es', 'i', 4, 'low', 'r', 'pending', 'm', 'v1'),
        (1, 'avisos medicina', 'es', 'i', 4, 'low', 'r', 'pending', 'm', 'v1'),
        (1, 'tomar agua', 'es', 'i', 4, 'low', 'r', 'dismissed', 'm', 'v1'),
        (1, 'alarma', 'es', 'i', 4, 'low', 'r', 'pending', 'm', 'v1');
      INSERT INTO keyword_candidates (app_id, term, source, status) VALUES
        (1, 'recordar pastillas', 'reviews', 'pending'),
        (1, 'recordar pastillas', 'autocomplete', 'pending'),
        (1, 'tomar agua', 'reviews', 'pending'),
        (1, 'pastillero', 'reviews', 'pending'),
        (1, 'avisos medicina', 'top10', 'dismissed'),
        (1, 'calendario', 'reviews', 'pending'),
        (1, 'diario', 'ai', 'pending'),
        (1, 'agenda', 'top10', 'followed'),
        (2, 'calendario', 'reviews', 'pending');
    `);
  }, 120_000);

  afterAll(() => db.close());

  async function count(appId: number): Promise<number> {
    const query = dialect.sqlToQuery(sql`select ${pendingCandidatesSql(appId)} as n`);
    const { rows } = await db.query<{ n: string | number }>(query.sql, query.params as unknown[]);
    return Number(rows[0].n);
  }

  async function tray(appId: number): Promise<Candidate[]> {
    const [followed, stored, suggestions] = await Promise.all([
      db.query<{ term: string }>("select k.term from app_keywords ak join keywords k on k.id = ak.keyword_id where ak.app_id = $1", [appId]),
      db.query<CandidateRow>(
        `select term, source, status, reason, relevance, popularity_estimate as "popularityEstimate", popularity_measured as "popularityMeasured" from keyword_candidates where app_id = $1`,
        [appId],
      ),
      db.query<{ term: string; status: string }>("select term, status from ai_suggestions where app_id = $1", [appId]),
    ]);
    // As getCandidateContext and the Encontrar page build it.
    const dismissed = [
      ...stored.rows.filter((r) => r.status === "dismissed").map((r) => r.term),
      ...suggestions.rows.filter((s) => s.status === "dismissed").map((s) => normalizeKeyword(s.term)),
    ];
    const ai: Candidate[] = suggestions.rows
      .filter((s) => s.status === "pending")
      .map((s) => ({ term: normalizeKeyword(s.term), source: "ai", relevance: null, popularityEstimate: null, popularityMeasured: null, reason: "" }));
    return mergeCandidates([ai, storedCandidates(stored.rows)], { followed: followed.rows.map((f) => f.term), dismissed });
  }

  it("counts distinct terms, without followed ones nor those dismissed in any source", async () => {
    // recordar pastillas (AI + reviews + autocomplete, once), calendario. Not: pastillero and alarma
    // (followed… alarma only in market 2, so it stays), tomar agua and avisos medicina (dismissed elsewhere),
    // diario (an «ai» row of keyword_candidates), agenda (followed status).
    expect(await count(1)).toBe(3);
    expect((await tray(1)).map((c) => c.term).sort()).toEqual(["alarma", "calendario", "recordar pastillas"]);
  });

  it("is the same number as Encontrar's tray in every market", async () => {
    for (const appId of [1, 2, 3]) expect(await count(appId), `market ${appId}`).toBe((await tray(appId)).length);
  });

  it("marketCounters reads every counter of each market from its own rows, in one query", async () => {
    const draft = JSON.stringify({ title: "Pastillas 💊 GRATIS", subtitle: "", keywordField: "", shortDescription: "", description: "" });
    const stats = (to: string | null) => JSON.stringify({ count: to ? 5 : 0, average: 4, distribution: {}, from: null, to });
    // Ids chosen so that a bare "id" in a subquery (al.id, r.id…) would give other numbers.
    await db.exec(`
      INSERT INTO alerts (id, app_id, kind, tone, title, detail, read_at) VALUES
        (2, 1, 'moved_up', 'up', 't', 'd', null), (5, 1, 'moved_up', 'up', 't', 'd', null), (6, 1, 'moved_up', 'up', 't', 'd', now()),
        (1, 2, 'moved_up', 'up', 't', 'd', null);
      INSERT INTO rank_snapshots (id, app_id, keyword_id, store, country, date, position, top5, depth) VALUES
        (2, 1, 1, 'android', 'es', '2026-11-03', 4, '[]', 50), (1, 2, 2, 'android', 'us', '2026-11-01', 9, '[]', 50);
      INSERT INTO listing_drafts (app_id, locale, country, draft) VALUES (1, 'es-ES', '', '${draft}'), (1, 'es-ES', 'mx', '${draft}');
      INSERT INTO review_analyses (app_id, target_store_id, target_title, country, stats, result, model, prompt_version, created_at) VALUES
        (1, 'own', 'X', 'es', '${stats("2026-10-01T00:00:00.000Z")}', '{}', 'm', 'v', '2026-10-01'),
        (1, 'own', 'X', 'es', '${stats("2026-10-20T00:00:00.000Z")}', '{}', 'm', 'v', '2026-10-20'),
        (1, 'rival', 'R', 'es', '${stats(null)}', '{}', 'm', 'v', '2026-10-20'),
        (1, 'old', 'O', 'es', '${stats("2026-10-30T00:00:00.000Z")}', '{}', 'm', 'v', '2026-10-30'),
        (1, 'abroad', 'A', 'us', '${stats("2026-10-01T00:00:00.000Z")}', '{}', 'm', 'v', '2026-10-01');
      INSERT INTO review_freshness (app_id, target_store_id, latest_review_at, checked_on) VALUES
        (1, 'own', '2026-10-25T00:00:00Z', '2026-11-04'),
        (1, 'rival', '2026-10-25T00:00:00Z', '2026-11-04'),
        (1, 'old', '2026-10-25T00:00:00Z', '2026-11-04'),
        (1, 'abroad', '2026-10-25T00:00:00Z', '2026-11-04'),
        (1, 'never-analysed', '2026-10-25T00:00:00Z', '2026-11-04');
    `);
    const counters = toMarketCounters(await marketCounterRows(drizzle(db, { schema }), 1));
    const es = counters[1];
    expect(es.pending).toBe(await count(1));
    expect(es.alerts).toBe(2);
    expect(es.lastCheck).toBe("2026-11-03");
    // own (newer than its LAST analysis) and rival (its analysis found none); not «old» (read after),
    // «abroad» (analysed in another country) nor «never-analysed».
    expect(es.reviews).toBe(2);
    expect(es.listing).toBe(listingWarningCount({ store: "android", country: "es", meta: meta(), drafts: [{ locale: "es-ES", draft: JSON.parse(draft) }], keywords: ["pastillero"] }));
    expect(es.listing).toBeGreaterThan(0);
    expect(counters[2]).toMatchObject({ pending: await count(2), alerts: 1, reviews: 0, lastCheck: "2026-11-01" });
    expect(counters[2].listing).toBe(listingWarningCount({ store: "android", country: "us", meta: meta(), drafts: [], keywords: ["alarma"] }));
  });
});
