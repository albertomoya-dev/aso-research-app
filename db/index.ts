import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

let instance: ReturnType<typeof createDb> | undefined;

function createDb(url: string) {
  return drizzle(neon(url), { schema });
}

/** Created on first use so builds and pages without a database still work. */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL. Copia .env.example a .env.local y rellénalo.");
  instance ??= createDb(url);
  return instance;
}

export { schema };
