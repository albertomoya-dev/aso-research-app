ALTER TABLE "review_analyses" ADD COLUMN "country" text;--> statement-breakpoint
-- Until now the reviews were always read from the app's own country.
UPDATE "review_analyses" SET "country" = "apps"."country" FROM "apps" WHERE "apps"."id" = "review_analyses"."app_id";
