ALTER TYPE "public"."keyword_source" ADD VALUE 'top10';--> statement-breakpoint
ALTER TYPE "public"."keyword_source" ADD VALUE 'discover';--> statement-breakpoint
ALTER TABLE "app_keywords" ADD COLUMN "relevance_source" text;--> statement-breakpoint
ALTER TABLE "app_keywords" ADD COLUMN "intent" text;--> statement-breakpoint
ALTER TABLE "app_keywords" ADD COLUMN "relevance_checked_at" timestamp with time zone;--> statement-breakpoint
-- Relevance stored before this migration came from AI ideas.
UPDATE "app_keywords" SET "relevance_source" = 'ai' WHERE "relevance" IS NOT NULL;