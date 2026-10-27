import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb, schema } from "@/db";

/** The followed app for a route param, or a 404. Cached per request so metadata and page share one query. */
export const loadApp = cache(async (id: string) => {
  const appId = Number(id);
  if (!Number.isInteger(appId) || appId <= 0) notFound();
  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) notFound();
  return app;
});
