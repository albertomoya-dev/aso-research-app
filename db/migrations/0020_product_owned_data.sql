-- Hand-edited (like 0015 and 0019). The app-wide tables move from the market (app_id) to the product
-- (product_id): product_facts, product_features, product_releases, brand_exceptions, asset_designs and
-- generated_images. drizzle-kit added product_id NOT NULL straight away and could not name the PK of
-- product_facts; here product_id is added nullable, filled in, deduplicated and only then constrained.
--
-- app_id is NOT dropped: it stays nullable, no longer written, with ON DELETE SET NULL (so unfollowing
-- a market never deletes the product's data). Code older than phase 26 can only READ after 0019/0020:
-- its writes fail (product_id is NOT NULL, the app_id keys are gone), so deploy the new code right after
-- migrating. A later cleanup migration drops app_id.
--
-- Merge rules when two markets of one product both had rows ("first" = lowest apps.id with rows, the
-- primary market when it has any):
--   product_facts      one per product: the first market's row. Its empty text fields are filled from
--                      the next market that has them; the lists (differentiators, constraints,
--                      languages) become the ordered union of every market's: the first market's items,
--                      then the others' whose normalised text is new (normalised: lower case, no
--                      accents, single spaces, as for features).
--   product_features   the first market's, plus the other markets' whose normalised name (lower case,
--                      no accents, single spaces) is not there yet; renumbered so the extra ones go last.
--   product_releases   one per version: the first market's row; an empty date comes from another
--                      market, and every distinct non-empty notes text is kept, the others' appended
--                      after a "---" line.
--   brand_exceptions   the union of every market's words.
--   asset_designs      one per kind: the first market's. The others' rows are copied first to the
--                      table asset_designs_merged_0020 (not in the schema; the cleanup migration drops
--                      it) and their ids raised as a NOTICE, so no design is lost.
--   generated_images   all kept.

-- 1. Old keys: cascade FKs on app_id, and the keys built on it.
ALTER TABLE "asset_designs" DROP CONSTRAINT "asset_designs_app_id_apps_id_fk";--> statement-breakpoint
ALTER TABLE "brand_exceptions" DROP CONSTRAINT "brand_exceptions_app_id_apps_id_fk";--> statement-breakpoint
ALTER TABLE "generated_images" DROP CONSTRAINT "generated_images_app_id_apps_id_fk";--> statement-breakpoint
ALTER TABLE "product_facts" DROP CONSTRAINT "product_facts_app_id_apps_id_fk";--> statement-breakpoint
ALTER TABLE "product_features" DROP CONSTRAINT "product_features_app_id_apps_id_fk";--> statement-breakpoint
ALTER TABLE "product_releases" DROP CONSTRAINT "product_releases_app_id_apps_id_fk";--> statement-breakpoint
DROP INDEX "asset_designs_app_kind_idx";--> statement-breakpoint
ALTER TABLE "brand_exceptions" DROP CONSTRAINT "brand_exceptions_app_id_word_pk";--> statement-breakpoint
ALTER TABLE "product_facts" DROP CONSTRAINT "product_facts_pkey";--> statement-breakpoint
ALTER TABLE "asset_designs" ALTER COLUMN "app_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_exceptions" ALTER COLUMN "app_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_images" ALTER COLUMN "app_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_facts" ALTER COLUMN "app_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_features" ALTER COLUMN "app_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_releases" ALTER COLUMN "app_id" DROP NOT NULL;--> statement-breakpoint

-- 2. product_id, nullable for now, from each row's market.
ALTER TABLE "asset_designs" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "brand_exceptions" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "generated_images" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "product_facts" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "product_features" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "product_releases" ADD COLUMN "product_id" integer;--> statement-breakpoint
UPDATE "asset_designs" SET "product_id" = "apps"."product_id" FROM "apps" WHERE "apps"."id" = "asset_designs"."app_id";--> statement-breakpoint
UPDATE "brand_exceptions" SET "product_id" = "apps"."product_id" FROM "apps" WHERE "apps"."id" = "brand_exceptions"."app_id";--> statement-breakpoint
UPDATE "generated_images" SET "product_id" = "apps"."product_id" FROM "apps" WHERE "apps"."id" = "generated_images"."app_id";--> statement-breakpoint
UPDATE "product_facts" SET "product_id" = "apps"."product_id" FROM "apps" WHERE "apps"."id" = "product_facts"."app_id";--> statement-breakpoint
UPDATE "product_features" SET "product_id" = "apps"."product_id" FROM "apps" WHERE "apps"."id" = "product_features"."app_id";--> statement-breakpoint
UPDATE "product_releases" SET "product_id" = "apps"."product_id" FROM "apps" WHERE "apps"."id" = "product_releases"."app_id";--> statement-breakpoint

-- 3. Deduplicate per product.
-- product_facts: fill the first row's empty text fields from the other markets (lowest app_id first)
-- and merge the lists (DISTINCT ON keeps an item's first occurrence: lowest market, then its position)…
UPDATE "product_facts" AS "p" SET
	"brand" = COALESCE(NULLIF("p"."brand", ''), (SELECT "o"."brand" FROM "product_facts" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id" AND "o"."brand" <> '' ORDER BY "o"."app_id" LIMIT 1), ''),
	"pitch" = COALESCE(NULLIF("p"."pitch", ''), (SELECT "o"."pitch" FROM "product_facts" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id" AND "o"."pitch" <> '' ORDER BY "o"."app_id" LIMIT 1), ''),
	"audience" = COALESCE(NULLIF("p"."audience", ''), (SELECT "o"."audience" FROM "product_facts" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id" AND "o"."audience" <> '' ORDER BY "o"."app_id" LIMIT 1), ''),
	"tone" = COALESCE(NULLIF("p"."tone", ''), (SELECT "o"."tone" FROM "product_facts" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id" AND "o"."tone" <> '' ORDER BY "o"."app_id" LIMIT 1), ''),
	"differentiators" = (SELECT COALESCE(jsonb_agg("u"."v" ORDER BY "u"."app_id", "u"."ord"), '[]'::jsonb) FROM (
		SELECT DISTINCT ON (regexp_replace(translate(lower(trim("e"."v" #>> '{}')), 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿß', 'aaaaaaaeeeeeiiiiiooooooouuuuuncyys'), '\s+', ' ', 'g')) "e"."v", "o"."app_id", "e"."ord"
		FROM "product_facts" "o", jsonb_array_elements(CASE WHEN jsonb_typeof("o"."differentiators") = 'array' THEN "o"."differentiators" ELSE '[]'::jsonb END) WITH ORDINALITY AS "e"("v", "ord")
		WHERE "o"."product_id" = "p"."product_id"
		ORDER BY regexp_replace(translate(lower(trim("e"."v" #>> '{}')), 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿß', 'aaaaaaaeeeeeiiiiiooooooouuuuuncyys'), '\s+', ' ', 'g'), "o"."app_id", "e"."ord") AS "u"),
	"constraints" = (SELECT COALESCE(jsonb_agg("u"."v" ORDER BY "u"."app_id", "u"."ord"), '[]'::jsonb) FROM (
		SELECT DISTINCT ON (regexp_replace(translate(lower(trim("e"."v" #>> '{}')), 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿß', 'aaaaaaaeeeeeiiiiiooooooouuuuuncyys'), '\s+', ' ', 'g')) "e"."v", "o"."app_id", "e"."ord"
		FROM "product_facts" "o", jsonb_array_elements(CASE WHEN jsonb_typeof("o"."constraints") = 'array' THEN "o"."constraints" ELSE '[]'::jsonb END) WITH ORDINALITY AS "e"("v", "ord")
		WHERE "o"."product_id" = "p"."product_id"
		ORDER BY regexp_replace(translate(lower(trim("e"."v" #>> '{}')), 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿß', 'aaaaaaaeeeeeiiiiiooooooouuuuuncyys'), '\s+', ' ', 'g'), "o"."app_id", "e"."ord") AS "u"),
	"languages" = (SELECT COALESCE(jsonb_agg("u"."v" ORDER BY "u"."app_id", "u"."ord"), '[]'::jsonb) FROM (
		SELECT DISTINCT ON (regexp_replace(translate(lower(trim("e"."v" #>> '{}')), 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿß', 'aaaaaaaeeeeeiiiiiooooooouuuuuncyys'), '\s+', ' ', 'g')) "e"."v", "o"."app_id", "e"."ord"
		FROM "product_facts" "o", jsonb_array_elements(CASE WHEN jsonb_typeof("o"."languages") = 'array' THEN "o"."languages" ELSE '[]'::jsonb END) WITH ORDINALITY AS "e"("v", "ord")
		WHERE "o"."product_id" = "p"."product_id"
		ORDER BY regexp_replace(translate(lower(trim("e"."v" #>> '{}')), 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿß', 'aaaaaaaeeeeeiiiiiooooooouuuuuncyys'), '\s+', ' ', 'g'), "o"."app_id", "e"."ord") AS "u"),
	"updated_at" = (SELECT max("o"."updated_at") FROM "product_facts" "o" WHERE "o"."product_id" = "p"."product_id")
WHERE NOT EXISTS (SELECT 1 FROM "product_facts" "f" WHERE "f"."product_id" = "p"."product_id" AND "f"."app_id" < "p"."app_id")
	AND EXISTS (SELECT 1 FROM "product_facts" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id");--> statement-breakpoint
-- …then drop the other markets' rows.
DELETE FROM "product_facts" AS "p" USING "product_facts" AS "f"
WHERE "f"."product_id" = "p"."product_id" AND "f"."app_id" < "p"."app_id";--> statement-breakpoint
-- product_features: drop a feature when a lower market of the product already has the same normalised name.
DELETE FROM "product_features" AS "p" USING "product_features" AS "f"
WHERE "f"."product_id" = "p"."product_id" AND "f"."app_id" < "p"."app_id"
	AND regexp_replace(translate(lower(trim("f"."name")), 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿß', 'aaaaaaaeeeeeiiiiiooooooouuuuuncyys'), '\s+', ' ', 'g')
	  = regexp_replace(translate(lower(trim("p"."name")), 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿß', 'aaaaaaaeeeeeiiiiiooooooouuuuuncyys'), '\s+', ' ', 'g');--> statement-breakpoint
-- …and renumber: the first market's in their order, then the ones added from other markets.
UPDATE "product_features" SET "sort" = "n"."sort"
FROM (
	SELECT "id", (row_number() OVER (PARTITION BY "product_id" ORDER BY "app_id", "sort", "id") - 1)::integer AS "sort"
	FROM "product_features"
) AS "n"
WHERE "n"."id" = "product_features"."id" AND "product_features"."product_id" IN (
	SELECT "product_id" FROM "product_features" GROUP BY "product_id" HAVING count(DISTINCT "app_id") > 1
);--> statement-breakpoint
-- product_releases: one per version, the lowest market's row, with the date and notes of the others…
UPDATE "product_releases" AS "p" SET
	"date" = COALESCE("p"."date", (SELECT "o"."date" FROM "product_releases" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id" AND trim("o"."version") = trim("p"."version") AND "o"."date" IS NOT NULL ORDER BY "o"."app_id", "o"."id" LIMIT 1)),
	"notes" = COALESCE((SELECT string_agg("n"."notes", E'\n\n---\n\n' ORDER BY "n"."app_id", "n"."id") FROM (
		SELECT trim("o"."notes") AS "notes", min("o"."app_id") AS "app_id", min("o"."id") AS "id"
		FROM "product_releases" "o"
		WHERE "o"."product_id" = "p"."product_id" AND trim("o"."version") = trim("p"."version") AND ("o"."id" = "p"."id" OR "o"."app_id" > "p"."app_id") AND trim("o"."notes") <> ''
		GROUP BY trim("o"."notes")) AS "n"), "p"."notes")
WHERE NOT EXISTS (SELECT 1 FROM "product_releases" "f" WHERE "f"."product_id" = "p"."product_id" AND "f"."app_id" < "p"."app_id" AND trim("f"."version") = trim("p"."version"))
	AND EXISTS (SELECT 1 FROM "product_releases" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id" AND trim("o"."version") = trim("p"."version"));--> statement-breakpoint
-- …then drop the others.
DELETE FROM "product_releases" AS "p" USING "product_releases" AS "f"
WHERE "f"."product_id" = "p"."product_id" AND "f"."app_id" < "p"."app_id" AND trim("f"."version") = trim("p"."version");--> statement-breakpoint
-- brand_exceptions: the union (a word only once per product).
DELETE FROM "brand_exceptions" AS "p" USING "brand_exceptions" AS "f"
WHERE "f"."product_id" = "p"."product_id" AND "f"."app_id" < "p"."app_id" AND "f"."word" = "p"."word";--> statement-breakpoint
-- asset_designs: one per kind, the lowest market's. The others are copied aside first and listed in a NOTICE…
CREATE TABLE "asset_designs_merged_0020" AS
SELECT "p".* FROM "asset_designs" "p"
WHERE EXISTS (SELECT 1 FROM "asset_designs" "f" WHERE "f"."product_id" = "p"."product_id" AND "f"."app_id" < "p"."app_id" AND "f"."kind" = "p"."kind");--> statement-breakpoint
DO $$
DECLARE
	ids text;
BEGIN
	SELECT string_agg("id"::text || ' (app ' || "app_id" || ', ' || "kind" || ')', ', ' ORDER BY "id") INTO ids FROM "asset_designs_merged_0020";
	IF ids IS NOT NULL THEN
		RAISE NOTICE 'asset_designs not kept (another market of the product has one of that kind), copied to asset_designs_merged_0020: %', ids;
	END IF;
END $$;--> statement-breakpoint
-- …and dropped from asset_designs.
DELETE FROM "asset_designs" AS "p" USING "asset_designs" AS "f"
WHERE "f"."product_id" = "p"."product_id" AND "f"."app_id" < "p"."app_id" AND "f"."kind" = "p"."kind";--> statement-breakpoint
-- generated_images: nothing to merge, every image stays.

-- 4. New keys.
ALTER TABLE "asset_designs" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_exceptions" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_images" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_facts" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_features" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_releases" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_facts" ADD CONSTRAINT "product_facts_pkey" PRIMARY KEY("product_id");--> statement-breakpoint
ALTER TABLE "brand_exceptions" ADD CONSTRAINT "brand_exceptions_product_id_word_pk" PRIMARY KEY("product_id","word");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_designs_product_kind_idx" ON "asset_designs" USING btree ("product_id","kind");--> statement-breakpoint
ALTER TABLE "asset_designs" ADD CONSTRAINT "asset_designs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_designs" ADD CONSTRAINT "asset_designs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_exceptions" ADD CONSTRAINT "brand_exceptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_exceptions" ADD CONSTRAINT "brand_exceptions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_facts" ADD CONSTRAINT "product_facts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_facts" ADD CONSTRAINT "product_facts_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_features" ADD CONSTRAINT "product_features_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_features" ADD CONSTRAINT "product_features_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_releases" ADD CONSTRAINT "product_releases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_releases" ADD CONSTRAINT "product_releases_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;
