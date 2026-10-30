CREATE TABLE "publications" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"store" "store" NOT NULL,
	"locale" text NOT NULL,
	"store_locale" text NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"fields" jsonb NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"external_ref" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_term_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"source" text DEFAULT 'play_csv' NOT NULL,
	"term" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	"acquisitions" integer DEFAULT 0 NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_term_stats" ADD CONSTRAINT "search_term_stats_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "search_term_stats_unique_idx" ON "search_term_stats" USING btree ("app_id","source","term","period_start","period_end");