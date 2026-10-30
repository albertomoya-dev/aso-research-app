CREATE TYPE "public"."feature_status" AS ENUM('shipped', 'next_release', 'planned', 'retired');--> statement-breakpoint
CREATE TABLE "product_facts" (
	"app_id" integer PRIMARY KEY NOT NULL,
	"pitch" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"differentiators" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tone" text DEFAULT '' NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" "feature_status" DEFAULT 'shipped' NOT NULL,
	"since_version" text,
	"advertise" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_releases" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"version" text NOT NULL,
	"date" date,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_facts" ADD CONSTRAINT "product_facts_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_features" ADD CONSTRAINT "product_features_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_releases" ADD CONSTRAINT "product_releases_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;