CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'accepted', 'dismissed');--> statement-breakpoint
CREATE TABLE "ai_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"term" text NOT NULL,
	"language" text NOT NULL,
	"intent" text NOT NULL,
	"relevance" integer NOT NULL,
	"estimated_competition" text NOT NULL,
	"reason" text NOT NULL,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_keywords" ADD COLUMN "relevance" integer;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_suggestions_app_term_idx" ON "ai_suggestions" USING btree ("app_id","term");