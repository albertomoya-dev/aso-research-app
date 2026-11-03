import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs the real migrations (db/migrations, in journal order) on an in-memory Postgres (PGlite), with
// sample data inserted just before 0019_products (and 0020_product_owned_data), and checks the backfills.

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

describe("migration 0020_product_owned_data", () => {
  const db = new PGlite();

  beforeAll(async () => {
    const owned = tags.indexOf("0020_product_owned_data");
    expect(owned).toBeGreaterThan(0);
    for (const tag of tags.slice(0, owned)) await migrate(db, tag);

    // Product 1 has two markets (apps 1 ES and 4 US) that each filled in the app-wide tables; product 2
    // (app 2) has one, and must come out unchanged.
    await db.exec(`
      INSERT INTO products (id, store, store_id, slug, title, icon) VALUES
        (1, 'android', 'com.moyalogames.recordatorio', 'recordatorio', 'Recordatorio', 'i'),
        (2, 'ios', '1234567890', 'pastillero', 'Pastillero', 'i');
      INSERT INTO apps (id, product_id, store, store_id, country, title, developer, icon, url, meta) VALUES
        (1, 1, 'android', 'com.moyalogames.recordatorio', 'es', 'Recordatorio', 'Moya', 'i', 'u', '${meta("Recordatorio")}'),
        (2, 2, 'ios', '1234567890', 'es', 'Pastillero', 'Otro', 'i', 'u', '${meta("Pastillero")}'),
        (4, 1, 'android', 'com.moyalogames.recordatorio', 'us', 'Pill Reminder', 'Moya', 'i', 'u', '${meta("Pill Reminder")}');
      INSERT INTO product_facts (app_id, brand, pitch, audience, differentiators, constraints, tone, languages) VALUES
        (1, 'Recordatorio', 'Para no olvidar las pastillas', '', '[]', '["Sin consejos médicos"]', '', '[]'),
        (4, 'Reminder', 'Never miss a pill', 'Adults', '["Offline"]', '["No medical claims"]', 'Friendly', '[]'),
        (2, 'Pastillero', 'Otro', '', '[]', '[]', '', '[]');
      INSERT INTO product_features (app_id, name, sort) VALUES
        (1, 'Avisos', 0), (1, 'Historial', 1),
        (4, 'Widgets', 0), (4, '  avísos ', 1), (4, 'Exportar', 3), (4, 'HISTORIAL', 5),
        (2, 'Avisos', 0);
      INSERT INTO product_releases (app_id, version, notes) VALUES (1, '1.0', 'es'), (4, '1.0', 'us'), (4, '1.1', 'us');
      INSERT INTO brand_exceptions (app_id, word) VALUES (1, 'pastillas'), (1, 'reminder'), (4, 'reminder'), (4, 'pill');
      INSERT INTO asset_designs (app_id, kind, spec) VALUES (1, 'icon', '{"from":"es"}'), (4, 'icon', '{"from":"us"}'), (4, 'screenshots', '{"from":"us"}');
      INSERT INTO generated_images (app_id, kind, prompt, provider, model, mime, data) VALUES
        (1, 'logo', 'p', 'x', 'm', 'image/png', 'a'), (4, 'logo', 'p', 'x', 'm', 'image/png', 'b'), (4, 'background', 'p', 'x', 'm', 'image/png', 'c');
    `);
    for (const tag of tags.slice(owned)) await migrate(db, tag);
  }, 60_000);

  afterAll(() => db.close());

  it("keeps one product sheet per product: the primary market's, with its empty fields filled from the others", async () => {
    const { rows } = await db.query(
      "SELECT product_id, brand, pitch, audience, differentiators, constraints, tone, languages FROM product_facts ORDER BY product_id",
    );
    expect(rows).toEqual([
      {
        product_id: 1,
        brand: "Recordatorio",
        pitch: "Para no olvidar las pastillas",
        audience: "Adults",
        differentiators: ["Offline"],
        constraints: ["Sin consejos médicos"],
        tone: "Friendly",
        languages: [],
      },
      { product_id: 2, brand: "Pastillero", pitch: "Otro", audience: "", differentiators: [], constraints: [], tone: "", languages: [] },
    ]);
  });

  it("adds the other markets' features whose normalised name is new, after the primary market's", async () => {
    const { rows } = await db.query("SELECT product_id, name, sort FROM product_features ORDER BY product_id, sort");
    expect(rows).toEqual([
      { product_id: 1, name: "Avisos", sort: 0 },
      { product_id: 1, name: "Historial", sort: 1 },
      { product_id: 1, name: "Widgets", sort: 2 },
      { product_id: 1, name: "Exportar", sort: 3 },
      { product_id: 2, name: "Avisos", sort: 0 },
    ]);
  });

  it("merges releases by version, brand exceptions as a union, one design per kind and every image", async () => {
    const releases = await db.query("SELECT product_id, version, notes FROM product_releases ORDER BY version");
    expect(releases.rows).toEqual([
      { product_id: 1, version: "1.0", notes: "es" },
      { product_id: 1, version: "1.1", notes: "us" },
    ]);
    const brands = await db.query("SELECT product_id, word FROM brand_exceptions ORDER BY word");
    expect(brands.rows).toEqual([
      { product_id: 1, word: "pastillas" },
      { product_id: 1, word: "pill" },
      { product_id: 1, word: "reminder" },
    ]);
    const designs = await db.query("SELECT product_id, kind, spec FROM asset_designs ORDER BY kind");
    expect(designs.rows).toEqual([
      { product_id: 1, kind: "screenshots", spec: { from: "us" } },
      { product_id: 1, kind: "icon", spec: { from: "es" } },
    ]);
    const images = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM generated_images WHERE product_id = 1");
    expect(images.rows[0].n).toBe(3);
  });

  it("enforces the product keys; new rows need no market", async () => {
    await expect(db.exec("INSERT INTO product_facts (product_id) VALUES (1)")).rejects.toThrow(/product_facts_pkey/);
    await expect(db.exec("INSERT INTO brand_exceptions (product_id, word) VALUES (1, 'pill')")).rejects.toThrow(/brand_exceptions_product_id_word_pk/);
    await expect(db.exec("INSERT INTO asset_designs (product_id, kind, spec) VALUES (1, 'icon', '{}')")).rejects.toThrow(/asset_designs_product_kind_idx/);
    await expect(db.exec("INSERT INTO product_features (name) VALUES ('x')")).rejects.toThrow(/product_id/);
    await db.exec("INSERT INTO product_releases (product_id, version) VALUES (2, '2.0')");
  });

  it("keeps the product's data when a market is unfollowed, and drops it with the product", async () => {
    await db.exec("DELETE FROM apps WHERE id = 1");
    const facts = await db.query<{ app_id: number | null }>("SELECT app_id FROM product_facts WHERE product_id = 1");
    expect(facts.rows).toEqual([{ app_id: null }]);
    const features = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM product_features WHERE product_id = 1");
    expect(features.rows[0].n).toBe(4);
    await db.exec("DELETE FROM products WHERE id = 1");
    for (const table of ["product_facts", "product_features", "product_releases", "brand_exceptions", "asset_designs", "generated_images"]) {
      const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE product_id = 1`);
      expect(rows[0].n, table).toBe(0);
    }
  });
});
