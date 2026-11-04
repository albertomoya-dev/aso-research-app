CREATE TABLE "review_freshness" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"target_store_id" text NOT NULL,
	"latest_review_at" timestamp with time zone,
	"checked_on" date NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "review_freshness" ADD CONSTRAINT "review_freshness_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_freshness_app_target_idx" ON "review_freshness" USING btree ("app_id","target_store_id");