CREATE TABLE "brand_exceptions" (
	"app_id" integer NOT NULL,
	"word" text NOT NULL,
	CONSTRAINT "brand_exceptions_app_id_word_pk" PRIMARY KEY("app_id","word")
);
--> statement-breakpoint
ALTER TABLE "brand_exceptions" ADD CONSTRAINT "brand_exceptions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;