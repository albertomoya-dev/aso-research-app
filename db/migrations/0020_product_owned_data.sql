-- Hand-edited (like 0015 and 0019). The app-wide tables move from the market (app_id) to the product
-- (product_id): product_facts, product_features, product_releases, brand_exceptions, asset_designs and
-- generated_images. drizzle-kit added product_id NOT NULL straight away and could not name the PK of
-- product_facts; here product_id is added nullable, filled in, deduplicated and only then constrained.
--
-- app_id is NOT dropped: it stays nullable, no longer written, with ON DELETE SET NULL (so unfollowing
-- a market never deletes the product's data), because code still running on the pre-0020 schema reads
-- it. A later cleanup migration drops it.
--
-- Merge rules when two markets of one product both had rows ("first" = lowest apps.id with rows, the
-- primary market when it has any):
--   product_facts      one per product: the first market's row, with every empty field ('' or [])
--                      filled from the next market that has it.
--   product_features   the first market's, plus the other markets' whose normalised name (lower case,
--                      no accents, single spaces) is not there yet; renumbered so the extra ones go last.
--   product_releases   one per version: the first market's.
--   brand_exceptions   the union of every market's words.
--   asset_designs      one per kind: the first market's.
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
-- product_facts: fill the first row's empty fields from the other markets (lowest app_id first)…
UPDATE "product_facts" AS "p" SET
	"brand" = COALESCE(NULLIF("p"."brand", ''), (SELECT "o"."brand" FROM "product_facts" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id" AND "o"."brand" <> '' ORDER BY "o"."app_id" LIMIT 1), ''),
	"pitch" = COALESCE(NULLIF("p"."pitch", ''), (SELECT "o"."pitch" FROM "product_facts" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id" AND "o"."pitch" <> '' ORDER BY "o"."app_id" LIMIT 1), ''),
	"audience" = COALESCE(NULLIF("p"."audience", ''), (SELECT "o"."audience" FROM "product_facts" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id" AND "o"."audience" <> '' ORDER BY "o"."app_id" LIMIT 1), ''),
	"tone" = COALESCE(NULLIF("p"."tone", ''), (SELECT "o"."tone" FROM "product_facts" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id" AND "o"."tone" <> '' ORDER BY "o"."app_id" LIMIT 1), ''),
	"differentiators" = COALESCE(NULLIF("p"."differentiators", '[]'::jsonb), (SELECT "o"."differentiators" FROM "product_facts" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id" AND "o"."differentiators" <> '[]'::jsonb ORDER BY "o"."app_id" LIMIT 1), '[]'::jsonb),
	"constraints" = COALESCE(NULLIF("p"."constraints", '[]'::jsonb), (SELECT "o"."constraints" FROM "product_facts" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id" AND "o"."constraints" <> '[]'::jsonb ORDER BY "o"."app_id" LIMIT 1), '[]'::jsonb),
	"languages" = COALESCE(NULLIF("p"."languages", '[]'::jsonb), (SELECT "o"."languages" FROM "product_facts" "o" WHERE "o"."product_id" = "p"."product_id" AND "o"."app_id" > "p"."app_id" AND "o"."languages" <> '[]'::jsonb ORDER BY "o"."app_id" LIMIT 1), '[]'::jsonb),
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
-- product_releases: one per version, the lowest market's.
DELETE FROM "product_releases" AS "p" USING "product_releases" AS "f"
WHERE "f"."product_id" = "p"."product_id" AND "f"."app_id" < "p"."app_id" AND trim("f"."version") = trim("p"."version");--> statement-breakpoint
-- brand_exceptions: the union (a word only once per product).
DELETE FROM "brand_exceptions" AS "p" USING "brand_exceptions" AS "f"
WHERE "f"."product_id" = "p"."product_id" AND "f"."app_id" < "p"."app_id" AND "f"."word" = "p"."word";--> statement-breakpoint
-- asset_designs: one per kind, the lowest market's.
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
