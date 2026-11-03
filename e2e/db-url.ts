import { existsSync, readFileSync } from "node:fs";

/**
 * The e2e suite runs `next start` against a TEST database (a Neon branch), never production.
 * The URL comes from E2E_DATABASE_URL or from the file named by E2E_DATABASE_URL_FILE, and it is
 * refused when it matches the DATABASE_URL in .env.local, which is the production one.
 */
export function e2eDatabaseUrl(): string {
  const fromFile = process.env.E2E_DATABASE_URL_FILE;
  const url = (process.env.E2E_DATABASE_URL ?? (fromFile && existsSync(fromFile) ? readFileSync(fromFile, "utf8") : "")).trim();
  if (!url) {
    throw new Error("Falta la base de datos de prueba: define E2E_DATABASE_URL o E2E_DATABASE_URL_FILE (una rama de Neon, nunca producción).");
  }
  if (existsSync(".env.local")) {
    const line = readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("DATABASE_URL="));
    const local = line?.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
    if (local && hostOf(local) === hostOf(url)) {
      throw new Error("E2E_DATABASE_URL apunta a la misma base de datos que .env.local. Usa una rama de prueba.");
    }
  }
  return url;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
