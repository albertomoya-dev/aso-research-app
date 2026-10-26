import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";

/** The followed app for a route param, or a 404. */
export async function loadApp(id: string) {
  const appId = Number(id);
  if (!Number.isInteger(appId) || appId <= 0) notFound();
  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) notFound();
  return app;
}
