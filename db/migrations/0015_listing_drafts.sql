CREATE TABLE "listing_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"locale" text NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"draft" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_drafts" ADD CONSTRAINT "listing_drafts_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_drafts_app_locale_country_idx" ON "listing_drafts" USING btree ("app_id","locale","country");
--> statement-breakpoint
-- Data: copy each app's old draft (apps.draft) to the main listing of its country's locale
-- (lib/countries.ts `locale`). apps.draft is kept untouched; the app no longer writes it.
-- Every app country is in the list (apps only accept lib/countries.ts codes); the fallback is just in case.
INSERT INTO "listing_drafts" ("app_id", "locale", "country", "draft", "updated_at")
SELECT "apps"."id", COALESCE("map"."locale", lower("apps"."country") || '-' || upper("apps"."country")), '', "apps"."draft", now()
FROM "apps"
LEFT JOIN (VALUES ('es', 'es-ES'), ('mx', 'es-MX'), ('ar', 'es-AR'), ('co', 'es-CO'), ('cl', 'es-CL'), ('pe', 'es-PE'), ('ec', 'es-EC'), ('uy', 'es-UY'), ('py', 'es-PY'), ('bo', 'es-BO'), ('ve', 'es-VE'), ('cr', 'es-CR'), ('pa', 'es-PA'), ('gt', 'es-GT'), ('do', 'es-DO'), ('us', 'en-US'), ('gb', 'en-GB'), ('ca', 'en-CA'), ('au', 'en-AU'), ('nz', 'en-NZ'), ('ie', 'en-IE'), ('in', 'en-IN'), ('za', 'en-ZA'), ('ng', 'en-NG'), ('ph', 'en-PH'), ('sg', 'en-SG'), ('br', 'pt-BR'), ('pt', 'pt-PT'), ('fr', 'fr-FR'), ('be', 'fr-BE'), ('ch', 'de-CH'), ('de', 'de-DE'), ('at', 'de-AT'), ('it', 'it-IT'), ('nl', 'nl-NL'), ('se', 'sv-SE'), ('no', 'no-NO'), ('dk', 'da-DK'), ('fi', 'fi-FI'), ('pl', 'pl-PL'), ('cz', 'cs-CZ'), ('ro', 'ro-RO'), ('hu', 'hu-HU'), ('gr', 'el-GR'), ('tr', 'tr-TR'), ('ua', 'uk-UA'), ('il', 'he-IL'), ('sa', 'ar-SA'), ('ae', 'ar-AE'), ('eg', 'ar-EG'), ('jp', 'ja-JP'), ('kr', 'ko-KR'), ('tw', 'zh-TW'), ('hk', 'zh-HK'), ('th', 'th-TH'), ('vn', 'vi-VN'), ('id', 'id-ID'), ('my', 'ms-MY')) AS "map"("country", "locale") ON "map"."country" = lower("apps"."country")
WHERE "apps"."draft" IS NOT NULL
ON CONFLICT DO NOTHING;
