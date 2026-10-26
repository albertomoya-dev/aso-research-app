import { and, count, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { followInCountry } from "@/app/actions";
import { getDb, schema } from "@/db";
import { COUNTRIES, getCountry } from "@/lib/countries";
import { SubmitButton } from "./submit-button";
import { buttonSecondary, Card, inputClass } from "./ui";

/** The same app followed in other countries, and a form to add one more. */
export async function CountriesCard({ app }: { app: { id: number; store: "ios" | "android"; storeId: string; country: string } }) {
  const siblings = await getDb()
    .select({ id: schema.apps.id, country: schema.apps.country, keywords: count(schema.appKeywords.keywordId) })
    .from(schema.apps)
    .leftJoin(schema.appKeywords, eq(schema.appKeywords.appId, schema.apps.id))
    .where(and(eq(schema.apps.store, app.store), eq(schema.apps.storeId, app.storeId), ne(schema.apps.id, app.id)))
    .groupBy(schema.apps.id);
  const taken = new Set([app.country, ...siblings.map((s) => s.country)]);
  const available = COUNTRIES.filter((c) => !taken.has(c.code));
  const lang = getCountry(app.country).lang;

  return (
    <Card aria-label="Otros países" className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[15px] font-semibold">Otros países</h2>
        {siblings.length === 0 ? (
          <span className="text-[13px] text-muted">Solo sigues esta app en {getCountry(app.country).name}.</span>
        ) : (
          siblings.map((s) => (
            <Link
              key={s.id}
              href={`/apps/${s.id}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[13px] hover:bg-surface-muted"
            >
              {getCountry(s.country).name}
              <span className="text-muted">· {s.keywords}</span>
            </Link>
          ))
        )}
      </div>
      {available.length > 0 && (
        <form action={followInCountry} className="mt-3 flex flex-wrap items-end gap-2.5">
          <input type="hidden" name="appId" value={app.id} />
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
            Seguir también en
            <select name="country" className={inputClass} defaultValue={available.find((c) => c.lang === lang)?.code}>
              {available.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="copyKeywords" defaultChecked className="size-5 accent-[var(--brand)]" />
            Copiar las keywords (útil si el país comparte idioma)
          </label>
          <SubmitButton className={buttonSecondary} pendingLabel="Buscando la app…">
            Seguir en ese país
          </SubmitButton>
        </form>
      )}
    </Card>
  );
}
