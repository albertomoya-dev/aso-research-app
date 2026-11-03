CREATE TYPE "public"."candidate_source" AS ENUM('autocomplete', 'ai', 'top10', 'reviews');--> statement-breakpoint
CREATE TYPE "public"."candidate_status" AS ENUM('pending', 'followed', 'dismissed');--> statement-breakpoint
ALTER TYPE "public"."keyword_source" ADD VALUE 'reviews';--> statement-breakpoint
CREATE TABLE "keyword_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"term" text NOT NULL,
	"source" "candidate_source" NOT NULL,
	"status" "candidate_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"relevance" integer,
	"popularity_estimate" integer,
	"popularity_measured" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD COLUMN "top10" jsonb;--> statement-breakpoint
ALTER TABLE "keyword_candidates" ADD CONSTRAINT "keyword_candidates_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_candidates_app_term_source_idx" ON "keyword_candidates" USING btree ("app_id","term","source");