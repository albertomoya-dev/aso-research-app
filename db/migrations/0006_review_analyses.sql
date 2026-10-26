CREATE TABLE "review_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"target_store_id" text NOT NULL,
	"target_title" text NOT NULL,
	"stats" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_analyses" ADD CONSTRAINT "review_analyses_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;