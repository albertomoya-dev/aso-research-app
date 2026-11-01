import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { UNRATED_PICK_ORDER } from "@/lib/relevance-jobs";

describe("UNRATED_PICK_ORDER", () => {
  it("picks never-checked keywords first, then the least recently tried, then the oldest", () => {
    const { sql: text } = new PgDialect().sqlToQuery(sql.join([...UNRATED_PICK_ORDER], sql`, `));
    expect(text).toBe('"app_keywords"."relevance_checked_at" asc nulls first, "app_keywords"."created_at" asc');
  });
});
