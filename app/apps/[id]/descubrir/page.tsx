import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { DiscoverList } from "@/components/discover-list";
import { StoreBadge } from "@/components/store-badge";
import { buttonPrimary, Card, ErrorNote, inputClass, PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { loadApp } from "@/lib/apps";
import { hasAnthropicKey } from "@/lib/claude";
import { getCountry } from "@/lib/countries";
import { discoveryPrefixes, mergeSuggestions } from "@/lib/discover";
import { getAdapter } from "@/lib/stores";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ seed?: string }> };

export const metadata: Metadata = { title: "Descubrir keywords" };

export default async function DiscoverPage({ params, searchParams }: Props) {
  const app = await loadApp((await params).id);
  const seed = (await searchParams).seed?.trim().slice(0, 60) ?? "";
  const country = getCountry(app.country);

  let suggestions: string[] = [];
  let error: string | null = null;
  if (seed) {
    const adapter = getAdapter(app.store);
    const query = { country: app.country, lang: country.lang };
    const followed = await getDb()
      .select({ term: schema.keywords.term })
      .from(schema.appKeywords)
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
      .where(eq(schema.appKeywords.appId, app.id));
    const results = await Promise.allSettled(discoveryPrefixes(seed).map((p) => adapter.suggest(p, query)));
    const lists = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (lists.length === 0) {
      const first = results.find((r) => r.status === "rejected");
      error = first && first.status === "rejected" ? String(first.reason?.message ?? first.reason) : "Sin respuesta";
    }
    suggestions = mergeSuggestions(
      lists,
      seed,
      followed.map((f) => f.term),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Descubrir keywords
      </nav>
      <PageHeader title={`Descubrir keywords para ${app.title}`}>
        Escribe una palabra semilla y te mostramos lo que la gente completa en el buscador de la tienda: la semilla sola y seguida de cada letra
        de la «a» a la «z».
      </PageHeader>

      <Card className="px-5 py-4">
        <form className="flex flex-wrap items-end gap-2.5">
          <label className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
            Palabra semilla
            <input type="search" name="seed" defaultValue={seed} required maxLength={60} placeholder="correr" className={inputClass} />
          </label>
          <div className="flex min-h-11 items-center gap-2 text-sm text-muted">
            <StoreBadge store={app.store} country={app.country} />
          </div>
          <button type="submit" className={buttonPrimary}>
            Explorar
          </button>
        </form>
      </Card>

      {error && <ErrorNote>No se pudo consultar el autocompletado: {error}</ErrorNote>}

      {seed && !error && (
        <Card aria-label="Sugerencias" className="overflow-hidden">
          {suggestions.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              La tienda no sugiere nada nuevo para «{seed}» en {country.name}. Prueba con una palabra más general.
            </p>
          ) : (
            <DiscoverList
              appId={app.id}
              seed={seed}
              suggestions={suggestions}
              countryName={country.name}
              lang={country.lang}
              aiEnabled={hasAnthropicKey()}
            />
          )}
        </Card>
      )}
    </div>
  );
}
