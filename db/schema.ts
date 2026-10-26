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
  },
  (t) => [
    uniqueIndex("rank_snapshots_unique_idx").on(t.appId, t.keywordId, t.store, t.country, t.date),
  ],
);

export type App = typeof apps.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
