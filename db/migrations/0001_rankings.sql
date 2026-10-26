CREATE TABLE "annotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"date" date NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD COLUMN "depth" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;