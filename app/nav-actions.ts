"use server";

import { and, asc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";

const searchSchema = z.object({ appId: z.number().int().positive(), query: z.string().trim().max(80) });

export type KeywordHit = { id: number; term: string };

/** Keywords of one market whose term contains `query`, for the ⌘K palette. At most 8, cheap (one indexed join). */
export async function searchMarketKeywords(appId: number, query: string): Promise<KeywordHit[]> {
  const parsed = searchSchema.safeParse({ appId, query });
  if (!parsed.success || parsed.data.query.length < 2) return [];
  const pattern = `%${parsed.data.query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return getDb()
    .select({ id: schema.keywords.id, term: schema.keywords.term })
    .from(schema.appKeywords)
    .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
    .where(and(eq(schema.appKeywords.appId, parsed.data.appId), ilike(schema.keywords.term, pattern)))
    .orderBy(asc(schema.keywords.term))
    .limit(8);
}
