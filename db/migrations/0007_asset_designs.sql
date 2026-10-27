CREATE TYPE "public"."asset_kind" AS ENUM('screenshots', 'icon');--> statement-breakpoint
CREATE TABLE "asset_designs" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"spec" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_designs" ADD CONSTRAINT "asset_designs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_designs_app_kind_idx" ON "asset_designs" USING btree ("app_id","kind");