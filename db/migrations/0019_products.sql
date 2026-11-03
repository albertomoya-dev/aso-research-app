CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"store" "store" NOT NULL,
	"store_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"icon" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_store_id_idx" ON "products" USING btree ("store","store_id");--> statement-breakpoint
-- Hand-edited: drizzle-kit added the column NOT NULL straight away, which fails on a table with rows.
-- It is added nullable, filled in below and only then made NOT NULL.
ALTER TABLE "apps" ADD COLUMN "product_id" integer;--> statement-breakpoint
-- Data: one product per distinct (store, store_id), in the order the apps were followed. Title, icon
-- and creation date come from the lowest apps.id (the primary market). The slug is the tail of the
-- store id when it has letters («com.moyalogames.recordatorio» → «recordatorio»), else the title
-- (iOS ids are numbers); lower case, no accents, hyphens, at most 40 characters, and «-2», «-3»… when
-- taken. Same rule as lib/market-path.ts (`productSlugBase`, `uniqueSlug`); the slug is stored, never
-- recomputed, so a small difference with the JS version for exotic characters is harmless.
-- One statement (a DO block) so no helper function has to outlive it.
DO $$
DECLARE
	r record;
	base text;
	candidate text;
	n integer;
BEGIN
	FOR r IN
		SELECT * FROM (
			SELECT DISTINCT ON ("store", "store_id") "id", "store", "store_id", "title", "icon", "created_at"
			FROM "apps"
			ORDER BY "store", "store_id", "id"
		) AS "first" ORDER BY "id"
	LOOP
		base := trim(both '-' from left(trim(both '-' from regexp_replace(
			translate(lower(regexp_replace(r."store_id", '^.*\.', '')), 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿß', 'aaaaaaaeeeeeiiiiiooooooouuuuuncyys'),
			'[^a-z0-9]+', '-', 'g')), 40));
		IF base !~ '[a-z]' THEN
			base := trim(both '-' from left(trim(both '-' from regexp_replace(
				translate(lower(r."title"), 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿß', 'aaaaaaaeeeeeiiiiiooooooouuuuuncyys'),
				'[^a-z0-9]+', '-', 'g')), 40));
		END IF;
		IF base = '' THEN
			base := 'app';
		END IF;
		candidate := base;
		n := 1;
		WHILE EXISTS (SELECT 1 FROM "products" WHERE "slug" = candidate) LOOP
			n := n + 1;
			candidate := trim(both '-' from left(base, 40 - length('-' || n))) || '-' || n;
		END LOOP;
		INSERT INTO "products" ("store", "store_id", "slug", "title", "icon", "created_at")
		VALUES (r."store", r."store_id", candidate, r."title", r."icon", r."created_at");
	END LOOP;
END $$;--> statement-breakpoint
UPDATE "apps" SET "product_id" = "products"."id"
FROM "products"
WHERE "products"."store" = "apps"."store" AND "products"."store_id" = "apps"."store_id";--> statement-breakpoint
ALTER TABLE "apps" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
