import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon } from "@/components/app-icon";
import { TopKeywordsTable } from "@/components/top-keywords-table";
import { buttonPrimary, Card, ErrorNote, inputClass, PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { loadApp } from "@/lib/apps";
import { getCountry } from "@/lib/countries";
import { normalizeKeyword } from "@/lib/keywords";
import { fetchTopApps, type TopAppsResult } from "@/lib/top-apps";
import { extractTopTerms, MAX_SEED_KEYWORDS, TOP_DEPTH, toTopListing } from "@/lib/top-keywords";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ kw?: string; term?: string }> };

export const metadata: Metadata = { title: "Keywords del TOP 10" };

const ALL = "all";

export default async function TopKeywordsPage({ params, searchParams }: Props) {
  const app = await loadApp((await params).id);
  const { kw = "", term: rawTerm = "" } = await searchParams;
  const country = getCountry(app.country);

  const followed = await getDb()
    .select({ term: schema.keywords.term })
    .from(schema.appKeywords)
    .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
    .where(eq(schema.appKeywords.appId, app.id))
    .orderBy(asc(schema.keywords.term));
  const followedTerms = followed.map((f) => f.term);

  // A typed term wins over the selector; "all" searches the first followed keywords.
  const typed = normalizeKeyword(rawTerm).slice(0, 60);
  const seeds = typed ? [typed] : kw === ALL ? followedTerms.slice(0, MAX_SEED_KEYWORDS) : followedTerms.includes(kw) ? [kw] : [];

  let result: TopAppsResult | null = null;
  if (seeds.length > 0) result = await fetchTopApps(app, seeds);
  const terms = result
    ? extractTopTerms(result.apps.map(toTopListing), { lang: country.lang, exclude: seeds })
    : [];
  const titles = Object.fromEntries((result?.apps ?? []).map((a) => [a.id, a.title]));
  const label = typed || (kw === ALL ? `tus ${seeds.length} keywords` : kw);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Keywords del TOP 10">
        Leemos la ficha de las {TOP_DEPTH} primeras apps de la búsqueda (
        {app.store === "android" ? "título, descripción corta y descripción" : "título y descripción; Apple no publica el subtítulo"}) y sacamos
        las palabras y frases que comparten. Síguelas para medir tu posición o expórtalas a CSV.
      </PageHeader>

      <Card className="px-5 py-4">
        <form className="flex flex-wrap items-end gap-2.5">
          <label className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
            Keyword que sigues
            <select name="kw" defaultValue={typed ? "" : kw} className={inputClass}>
              <option value="">Elige una…</option>
              {followedTerms.length > 1 && (
                <option value={ALL}>
                  Todas ({Math.min(followedTerms.length, MAX_SEED_KEYWORDS)} primeras)
                </option>
              )}
              {followedTerms.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
            O escribe otra búsqueda
            <input type="search" name="term" defaultValue={typed} maxLength={60} placeholder="app para correr" className={inputClass} />
          </label>
          <button type="submit" className={buttonPrimary}>
            Analizar TOP 10
          </button>
        </form>
        {kw === ALL && followedTerms.length > MAX_SEED_KEYWORDS && (
          <p className="mt-2 text-[13px] text-muted">
            Para que la página cargue rápido se buscan las {MAX_SEED_KEYWORDS} primeras por orden alfabético.
          </p>
        )}
      </Card>

      {result && result.errors.length > 0 && (
        <ErrorNote>
          {result.apps.length === 0 ? "No se pudo consultar la tienda" : "Algunas consultas fallaron"}: {result.errors.slice(0, 3).join(" · ")}
        </ErrorNote>
      )}

      {result && result.apps.length > 0 && (
        <>
          <Card aria-label="Apps analizadas" className="px-5 py-4">
            <h2 className="text-sm font-semibold">
              {result.apps.length} apps analizadas para «{label}» en {country.name}
            </h2>
            <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {result.apps.map((a) => (
                <li key={a.id} className="flex min-w-0 items-center gap-2.5">
                  <span className="w-6 shrink-0 text-right font-mono text-sm text-muted">#{a.position}</span>
                  <AppIcon src={a.icon} size={32} />
                  <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm hover:underline" title={seeds.length > 1 ? `${a.title} · «${a.keyword}»` : a.title}>
                    {a.title}
                  </a>
                </li>
              ))}
            </ul>
          </Card>

          <Card aria-label="Keywords encontradas" className="overflow-hidden">
            {terms.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted">Las fichas no comparten palabras clave. Prueba con otra búsqueda.</p>
            ) : (
              <TopKeywordsTable
                appId={app.id}
                terms={terms}
                appCount={result.apps.length}
                titles={titles}
                followed={followedTerms}
                fileName={`keywords-top10-${label}-${app.store}-${app.country}`}
              />
            )}
          </Card>
        </>
      )}

      {seeds.length === 0 && followedTerms.length === 0 && !typed && (
        <p className="text-sm text-muted">
          Aún no sigues keywords. Escribe una búsqueda arriba o añade keywords en{" "}
          <Link href={`/apps/${app.id}`} className="text-brand hover:underline">
            Keywords
          </Link>
          .
        </p>
      )}
    </div>
  );
}
