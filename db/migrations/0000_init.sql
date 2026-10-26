CREATE TYPE "public"."keyword_source" AS ENUM('manual', 'ai', 'autocomplete');--> statement-breakpoint
CREATE TYPE "public"."store" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "app_keywords" (
	"app_id" integer NOT NULL,
	"keyword_id" integer NOT NULL,
	"source" "keyword_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_keywords_app_id_keyword_id_pk" PRIMARY KEY("app_id","keyword_id")
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" serial PRIMARY KEY NOT NULL,
	"store" "store" NOT NULL,
	"store_id" text NOT NULL,
	"country" text NOT NULL,
	"title" text NOT NULL,
	"developer" text NOT NULL,
	"icon" text NOT NULL,
	"url" text NOT NULL,
	"meta" jsonb NOT NULL,
	"meta_fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"term" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"keyword_id" integer NOT NULL,
	"store" "store" NOT NULL,
	"country" text NOT NULL,
	"date" date DEFAULT current_date NOT NULL,
	"position" integer,
	"top5" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_keywords" ADD CONSTRAINT "app_keywords_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_keywords" ADD CONSTRAINT "app_keywords_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "apps_store_id_country_idx" ON "apps" USING btree ("store","store_id","country");--> statement-breakpoint
CREATE UNIQUE INDEX "keywords_term_idx" ON "keywords" USING btree ("term");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_snapshots_unique_idx" ON "rank_snapshots" USING btree ("app_id","keyword_id","store","country","date");