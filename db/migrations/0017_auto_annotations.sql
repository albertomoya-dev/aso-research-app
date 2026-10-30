CREATE TABLE "app_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"listing" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"name" text NOT NULL,
	"hypothesis" text DEFAULT '' NOT NULL,
	"variant" text DEFAULT '' NOT NULL,
	"metric" text DEFAULT '' NOT NULL,
	"start_date" date,
	"end_date" date,
	"result" text DEFAULT '' NOT NULL,
	"learned" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "detail" jsonb;--> statement-breakpoint
ALTER TABLE "app_snapshots" ADD CONSTRAINT "app_snapshots_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;