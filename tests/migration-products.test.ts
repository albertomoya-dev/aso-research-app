import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs the real migrations (db/migrations, in journal order) on an in-memory Postgres (PGlite), with
// sample data inserted just before 0019_products, and checks the backfill of products.

const dir = join(process.cwd(), "db", "migrations");
const journal = JSON.parse(readFileSync(join(dir, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };
const tags = journal.entries.map((e) => e.tag);

async function migrate(db: PGlite, tag: string) {
  const text = readFileSync(join(dir, `${tag}.sql`), "utf8");
  // Same split as drizzle's migrator.
  for (const statement of text.split("--> statement-breakpoint")) {
    if (statement.trim()) await db.exec(statement);
  }
}

const meta = (title: string) => JSON.stringify({ title, developer: "Moya", category: "Medicina", description: "" });

describe("migration 0019_products", () => {
  const db = new PGlite();

  beforeAll(async () => {
    const products = tags.indexOf("0019_products");
    expect(products).toBeGreaterThan(0);
    for (const tag of tags.slice(0, products)) await migrate(db, tag);

    // Apps 1 and 4: the same Android app in Spain and the US. App 2: an iOS app (numeric id, slug from
    // the title, with accents). App 3: another Android app whose package tail collides with app 1's.
    await db.exec(`
      INSERT INTO apps (id, store, store_id, country, title, developer, icon, url, meta) VALUES
        (1, 'android', 'com.moyalogames.recordatorio', 'es', 'Recordatorio: pastillas', 'Moya', 'icon-es', 'u', '${meta("Recordatorio")}'),
        (2, 'ios', '1234567890', 'es', 'Pastillero Médico', 'Otro', 'icon-ios', 'u', '${meta("Pastillero")}'),
        (3, 'android', 'com.otra.recordatorio', 'es', 'Otro recordatorio', 'Otra', 'icon-otra', 'u', '${meta("Otro")}'),
        (4, 'android', 'com.moyalogames.recordatorio', 'us', 'Pill Reminder', 'Moya', 'icon-us', 'u', '${meta("Pill Reminder")}');
      SELECT setval('apps_id_seq', 4);
      INSERT INTO product_facts (app_id, brand, pitch) VALUES (1, 'Recordatorio', 'Para no olvidar las pastillas');
      INSERT INTO product_features (app_id, name, summary, status) VALUES (1, 'Avisos', 'Te avisa a tu hora', 'shipped');
      INSERT INTO brand_exceptions (app_id, word) VALUES (1, 'pastillas'), (4, 'reminder');
      WITH k AS (INSERT INTO keywords (term) VALUES ('pastillas') RETURNING id)
        INSERT INTO app_keywords (app_id, keyword_id) SELECT 1, id FROM k;
    `);
    await migrate(db, "0019_products");
    // Later migrations, if any, still apply on top.
    for (const tag of tags.slice(products + 1)) await migrate(db, tag);
  }, 60_000);

  afterAll(() => db.close());

  it("creates one product per (store, store_id), in the order the apps were followed", async () => {
    const { rows } = await db.query<{ id: number; store: string; store_id: string; slug: string; title: string; icon: string }>(
      "SELECT id, store, store_id, slug, title, icon FROM products ORDER BY id",
    );
    expect(rows).toEqual([
      // Title and icon of the lowest apps.id (app 1, not app 4).
      { id: 1, store: "android", store_id: "com.moyalogames.recordatorio", slug: "recordatorio", title: "Recordatorio: pastillas", icon: "icon-es" },
      { id: 2, store: "ios", store_id: "1234567890", slug: "pastillero-medico", title: "Pastillero Médico", icon: "icon-ios" },
      // Same package tail: the second one gets «-2».
      { id: 3, store: "android", store_id: "com.otra.recordatorio", slug: "recordatorio-2", title: "Otro recordatorio", icon: "icon-otra" },
    ]);
  });

  it("links every market to its product: apps 1 and 4 share one, no id changes", async () => {
    const { rows } = await db.query<{ id: number; country: string; product_id: number }>("SELECT id, country, product_id FROM apps ORDER BY id");
    expect(rows).toEqual([
      { id: 1, country: "es", product_id: 1 },
      { id: 2, country: "es", product_id: 2 },
      { id: 3, country: "es", product_id: 3 },
      { id: 4, country: "us", product_id: 1 },
    ]);
  });

  it("keeps the app's data where it was", async () => {
    const facts = await db.query<{ app_id: number }>("SELECT app_id FROM product_facts");
    expect(facts.rows).toEqual([{ app_id: 1 }]);
    const brands = await db.query<{ app_id: number; word: string }>("SELECT app_id, word FROM brand_exceptions ORDER BY app_id");
    expect(brands.rows).toEqual([
      { app_id: 1, word: "pastillas" },
      { app_id: 4, word: "reminder" },
    ]);
    const keywords = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM app_keywords WHERE app_id = 1");
    expect(keywords.rows[0].n).toBe(1);
  });

  it("makes product_id mandatory, slugs and (store, store_id) unique, and cascades from the product", async () => {
    await expect(
      db.exec("INSERT INTO apps (store, store_id, country, title, developer, icon, url, meta) VALUES ('ios', 'x', 'es', 't', 'd', 'i', 'u', '{}')"),
    ).rejects.toThrow(/product_id/);
    await expect(db.exec("INSERT INTO products (store, store_id, slug, title, icon) VALUES ('ios', 'y', 'recordatorio', 't', 'i')")).rejects.toThrow(
      /products_slug_unique/,
    );
    await expect(
      db.exec("INSERT INTO products (store, store_id, slug, title, icon) VALUES ('android', 'com.otra.recordatorio', 'otra', 't', 'i')"),
    ).rejects.toThrow(/products_store_store_id_idx/);
    await db.exec("DELETE FROM products WHERE id = 3");
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM apps WHERE id = 3");
    expect(rows[0].n).toBe(0);
  });
});
