import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AppMeta, AppSummary } from "@/lib/stores/types";
import type { AlertKind, AlertTone } from "@/lib/alerts";
import type { IconSpec } from "@/lib/assets/icon";
import type { ScreenshotSpec } from "@/lib/assets/screenshots";
import type { Listing } from "@/lib/listing-diff";
import type { MetadataDraft } from "@/lib/metadata-check";
// Relative so drizzle-kit can load it without the "@/" alias.
import { KEYWORD_SOURCES } from "../lib/keywords";
import { FEATURE_STATUSES } from "../lib/product-facts";
import type { KeywordIntent, RelevanceSource } from "@/lib/relevance";
import type { RatingStats, ReviewAnalysis } from "@/lib/review-analysis";
import type { TrendPoint } from "@/lib/trends";

export const storeEnum = pgEnum("store", ["ios", "android"]);
export const keywordSourceEnum = pgEnum("keyword_source", KEYWORD_SOURCES);
export const suggestionStatusEnum = pgEnum("suggestion_status", ["pending", "accepted", "dismissed"]);

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
    /** Work-in-progress listing from the metadata editor. */
    draft: jsonb("draft").$type<MetadataDraft>(),
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
    /** 1–5: how well the app answers this search. Null until the AI rates it or the user sets it. */
    relevance: integer("relevance"),
    /** Who set the relevance: "ai" (rateRelevance or an AI idea) or "user". The AI never overwrites "user". */
    relevanceSource: text("relevance_source").$type<RelevanceSource>(),
    /** "own" when people searching it want an app like this one, "foreign" when they want something else (a game, a messenger…). */
    intent: text("intent").$type<KeywordIntent>(),
    relevanceCheckedAt: timestamp("relevance_checked_at", { withTimezone: true }),
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

/** Keyword ideas from Claude, waiting for the user to accept or dismiss them. */
export const aiSuggestions = pgTable(
  "ai_suggestions",
  {
    id: serial("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    language: text("language").notNull(),
    intent: text("intent").notNull(),
    relevance: integer("relevance").notNull(),
    estimatedCompetition: text("estimated_competition").notNull(),
    reason: text("reason").notNull(),
    status: suggestionStatusEnum("status").notNull().default("pending"),
    /** Model that answered and prompt version, to compare suggestion quality later. */
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ai_suggestions_app_term_idx").on(t.appId, t.term)],
);

/** A competitor whose listing is checked every day. */
export const competitors = pgTable(
  "competitors",
  {
    id: serial("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    storeId: text("store_id").notNull(),
    title: text("title").notNull(),
    developer: text("developer").notNull(),
    icon: text("icon").notNull(),
    url: text("url").notNull(),
    rating: real("rating"),
    ratingsCount: integer("ratings_count"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    /** Last error from the store, cleared on the next successful check. */
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("competitors_app_store_id_idx").on(t.appId, t.storeId)],
);

/** A competitor listing, stored only when it differs from the previous one. */
export const competitorSnapshots = pgTable("competitor_snapshots", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  listing: jsonb("listing").$type<Listing>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Something worth a look: a ranking jump, a new #1, a competitor changing its listing. */
export const alerts = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AlertKind>().notNull(),
    tone: text("tone").$type<AlertTone>().notNull(),
    keywordId: integer("keyword_id").references(() => keywords.id, { onDelete: "cascade" }),
    competitorId: integer("competitor_id").references(() => competitors.id, { onDelete: "cascade" }),
    date: date("date").notNull().default(sql`current_date`),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Running the daily job twice must not repeat ranking alerts.
  (t) => [uniqueIndex("alerts_dedupe_idx").on(t.appId, t.kind, t.keywordId, t.date)],
);

/** Which alerts the user wants for an app. No row means the defaults: every kind, relevance 3 or more. */
export const alertPrefs = pgTable("alert_prefs", {
  appId: integer("app_id")
    .primaryKey()
    .references(() => apps.id, { onDelete: "cascade" }),
  kinds: jsonb("kinds").$type<AlertKind[]>().notNull(),
  /** Keywords rated below this only raise TOP 10 entries and exits. Unrated keywords always count. */
  minRelevance: integer("min_relevance").notNull().default(3),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Claude's reading of the latest reviews of our app or a competitor. */
export const reviewAnalyses = pgTable("review_analyses", {
  id: serial("id").primaryKey(),
  appId: integer("app_id")
    .notNull()
    .references(() => apps.id, { onDelete: "cascade" }),
  /** Store id of the analysed app: ours or a competitor's. */
  targetStoreId: text("target_store_id").notNull(),
  targetTitle: text("target_title").notNull(),
  stats: jsonb("stats").$type<RatingStats>().notNull(),
  result: jsonb("result").$type<ReviewAnalysis>().notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assetKindEnum = pgEnum("asset_kind", ["screenshots", "icon"]);

/** The saved screenshot set or icon design of an app (one per kind), built in the browser from its spec. */
export const assetDesigns = pgTable(
  "asset_designs",
  {
    id: serial("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    kind: assetKindEnum("kind").notNull(),
    spec: jsonb("spec").$type<ScreenshotSpec | IconSpec>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("asset_designs_app_kind_idx").on(t.appId, t.kind)],
);

/** A logo produced by the image provider, kept as base64 so it survives redeploys. */
export const generatedImages = pgTable("generated_images", {
  id: serial("id").primaryKey(),
  appId: integer("app_id")
    .notNull()
    .references(() => apps.id, { onDelete: "cascade" }),
  /** "logo" (square icon) or "background" (portrait backdrop for the screenshots). */
  kind: text("kind").notNull().default("logo"),
  prompt: text("prompt").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  mime: text("mime").notNull(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** What the app does, declared by its owner. The source of truth for every AI feature; the store listing lags behind. */
export const productFacts = pgTable("product_facts", {
  appId: integer("app_id")
    .primaryKey()
    .references(() => apps.id, { onDelete: "cascade" }),
  /** One line: what it is and who it is for. */
  pitch: text("pitch").notNull().default(""),
  audience: text("audience").notNull().default(""),
  differentiators: jsonb("differentiators").$type<string[]>().notNull().default([]),
  /** Things the listing must never say (for example, medical claims). */
  constraints: jsonb("constraints").$type<string[]>().notNull().default([]),
  tone: text("tone").notNull().default(""),
  languages: jsonb("languages").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureStatusEnum = pgEnum("feature_status", FEATURE_STATUSES);

export const productFeatures = pgTable("product_features", {
  id: serial("id").primaryKey(),
  appId: integer("app_id")
    .notNull()
    .references(() => apps.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  summary: text("summary").notNull().default(""),
  status: featureStatusEnum("status").notNull().default("shipped"),
  sinceVersion: text("since_version"),
  /** false for internal features the listing should not announce. */
  advertise: boolean("advertise").notNull().default(true),
  sort: integer("sort").notNull().default(0),
});

/** Version history declared by the owner (or imported from a CHANGELOG). */
export const productReleases = pgTable("product_releases", {
  id: serial("id").primaryKey(),
  appId: integer("app_id")
    .notNull()
    .references(() => apps.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  date: date("date"),
  notes: text("notes").notNull().default(""),
});

/** Words the user marked as «no es una marca»: the brand detector never treats them as a competitor brand. Folded, lower case. */
export const brandExceptions = pgTable(
  "brand_exceptions",
  {
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    word: text("word").notNull(),
  },
  (t) => [primaryKey({ columns: [t.appId, t.word] })],
);

export type App = typeof apps.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
export type Annotation = typeof annotations.$inferSelect;
