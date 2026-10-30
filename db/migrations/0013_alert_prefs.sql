CREATE TABLE "alert_prefs" (
	"app_id" integer PRIMARY KEY NOT NULL,
	"kinds" jsonb NOT NULL,
	"min_relevance" integer DEFAULT 3 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_prefs" ADD CONSTRAINT "alert_prefs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;