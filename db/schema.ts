import { sql } from "drizzle-orm";
import {
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AppMeta, AppSummary } from "@/lib/stores/types";
import type { TrendPoint } from "@/lib/trends";

export const storeEnum = pgEnum("store", ["ios", "android"]);
export const keywordSourceEnum = pgEnum("keyword_source", ["manual", "ai", "autocomplete"]);

/** A followed app in one store and one country. */
export const apps = pgTable(
  "apps",
  {
    id: serial("id").primaryKey(),
    store: storeEnum("store").notNull(),
    storeId: text("store_id").notNull(),
    country: text("country").notNull(),
    title: text("title").notNull(),
    developer: text("developer").notNull(),
    icon: text("icon").notNull(),
    url: text("url").notNull(),
    /** Last fetched store listing. */
    meta: jsonb("meta").$type<AppMeta>().notNull(),
    metaFetchedAt: timestamp("meta_fetched_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("apps_store_id_country_idx").on(t.store, t.storeId, t.country)],
);

export const keywords = pgTable(
  "keywords",
  {
    id: serial("id").primaryKey(),
    /** Normalized: lower case, single spaces. */
    term: text("term").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("keywords_term_idx").on(t.term)],
);

export const appKeywords = pgTable(
  "app_keywords",
  {
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    keywordId: integer("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    source: keywordSourceEnum("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.appId, t.keywordId] })],
);

/** One row per app, keyword, store, country and day. Filled by the daily job (step 2). */
export const rankSnapshots = pgTable(
  "rank_snapshots",
  {
    id: serial("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    keywordId: integer("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    store: storeEnum("store").notNull(),
    country: text("country").notNull(),
    date: date("date").notNull().default(sql`current_date`),
    /** 1-based; null when the app is outside the results we fetched. */
    position: integer("position"),
    top5: jsonb("top5").$type<AppSummary[]>().notNull(),
    /** How many results were fetched: a null position means "outside the top N". */
    depth: integer("depth").notNull(),
  },
  (t) => [
    uniqueIndex("rank_snapshots_unique_idx").on(t.appId, t.keywordId, t.store, t.country, t.date),
  ],
);

/** A dated note on the position chart: a metadata change, a release, a campaign. */
export const annotations = pgTable("annotations", {
  id: serial("id").primaryKey(),
  appId: integer("app_id")
    .notNull()
    .references(() => apps.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Popularity and difficulty of a keyword in one store and country. */
export const keywordMetrics = pgTable(
  "keyword_metrics",
  {
    keywordId: integer("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    store: storeEnum("store").notNull(),
    country: text("country").notNull(),
    /** 0–100 from the store autocomplete. */
    popularity: integer("popularity"),
    /** Letters typed before the store suggested it; null when it never did. */
    prefixLength: integer("prefix_length"),
    popularityAt: timestamp("popularity_at", { withTimezone: true }),
    /** 0–100 from the strength of the top 10. */
    difficulty: integer("difficulty"),
    difficultyAt: timestamp("difficulty_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.keywordId, t.store, t.country] })],
);

/** Google Trends interest over the last 12 months (relative 0–100). */
export const keywordTrends = pgTable(
  "keyword_trends",
  {
    keywordId: integer("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    country: text("country").notNull(),
    points: jsonb("points").$type<TrendPoint[]>(),
    error: text("error"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.keywordId, t.country] })],
);

export type App = typeof apps.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
export type Annotation = typeof annotations.$inferSelect;
