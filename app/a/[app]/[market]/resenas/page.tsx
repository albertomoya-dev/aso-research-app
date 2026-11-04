import { and, desc, eq } from "drizzle-orm";
import { Lightbulb, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AnalyzeReviewsForm } from "@/components/analyze-reviews-form";
import { AppIcon } from "@/components/app-icon";
import { DiscoverList } from "@/components/discover-list";
import { PlayReviews } from "@/components/play-reviews";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpTip } from "@/components/ui/help-tip";
import { getDb, schema } from "@/db";
import { hasAnthropicKey } from "@/lib/claude";
import { cn } from "@/lib/cn";
import { getCountry } from "@/lib/countries";
import { formatDate, formatRating } from "@/lib/format";
import { normalizeKeyword } from "@/lib/keywords";
import { playConfig } from "@/lib/play-console/auth";
import { featuresFor } from "@/lib/product-facts";
import { getProductFacts } from "@/lib/product-queries";
import { loadMarketParams, marketPath } from "@/lib/products";
import { aggregateCategoryAsks, type CategoryAsk, fixOpportunityStatus, type MatchConfidence, withCurrentOpportunityStatus } from "@/lib/review-analysis";
import { hasNewReviews, loadReviewFreshness } from "@/lib/review-freshness";
import { findInTop5, loadReviewTargets } from "@/lib/review-queries";

// Mercado › Reseñas (phase 31, REDISENO_UX §6.6): «Lo que pide la categoría» at the top; a column of
// sources (your app, the watched competitors, the apps already analysed) with their rating, the date of the
// last analysis and a dot when the store has newer reviews (lib/review-freshness.ts, read by the daily job);
// the analysis of the chosen source in cards. The country is the active market's.

type Props = { params: Promise<{ app: string; market: string }>; searchParams: Promise<{ t?: string }> };

export const metadata: Metadata = { title: "Reseñas" };
// Reading up to 300 reviews and asking Claude can take a minute.
export const maxDuration = 120;

const SENTIMENT = {
  positive: { label: "Positivo", className: "bg-android-bg text-android-fg" },
  negative: { label: "Negativo", className: "bg-danger-soft text-danger" },
  mixed: { label: "Mixto", className: "bg-warn-bg text-warn-fg" },
} as const;

const CONFIDENCE: Record<MatchConfidence, string> = {
  ia: "Según la IA",
  alta: "Confianza alta",
  media: "Confianza media",
};

function ListCard({ title, items, className, icon }: { title: string; items: string[]; className?: string; icon?: React.ReactNode }) {
  return (
    <Card aria-label={title} className={cn("flex flex-col gap-2 p-4 sm:p-5", className)}>
      <h3 className="flex items-center gap-2 text-card-title font-semibold">
        {icon}
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-table text-ink-soft">Nada destacable.</p>
      ) : (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink-soft">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      )}
    </Card>
  );
}

const ASKS_SHOWN = 3;

function AskItem({ ask, showMatch }: { ask: CategoryAsk; showMatch: "covered" | "next" | null }) {
  const match = showMatch === "covered" ? ask.coveredBy : showMatch === "next" ? ask.nextBy : null;
  return (
    <li className="border-b border-line py-2 text-sm last:border-0">
      {ask.text}
      {match && <span className="text-ink-soft"> → «{match.name}»</span>}
      <span className="block text-xs text-muted">
        {match ? CONFIDENCE[match.confidence] : ask.kind === "request" ? "Petición" : "Queja"} · {ask.apps.join(", ")}
      </span>
    </li>
  );
}

/** The first asks of a column; the rest behind «Ver N más», so the header stays short. */
function AskList({ items, empty, showMatch }: { items: CategoryAsk[]; empty: string; showMatch: "covered" | "next" | null }) {
  if (items.length === 0) return <p className="text-table text-ink-soft">{empty}</p>;
  const rest = items.slice(ASKS_SHOWN);
  return (
    <>
      <ul className="flex flex-col">
        {items.slice(0, ASKS_SHOWN).map((a) => (
          <AskItem key={a.text} ask={a} showMatch={showMatch} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group">
          <summary className="flex min-h-9 cursor-pointer items-center text-[13px] text-link hover:underline focus-visible:outline-2 focus-visible:outline-brand">
            <span className="group-open:hidden">Ver {rest.length} más</span>
            <span className="hidden group-open:inline">Ver menos</span>
          </summary>
          <ul className="flex flex-col">
            {rest.map((a) => (
              <AskItem key={a.text} ask={a} showMatch={showMatch} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export default async function ReviewsPage({ params, searchParams }: Props) {
  const app = await loadMarketParams(params);
  const db = getDb();
  const query = await searchParams;
  // The country is the market's: another country is another market (Ajustes › Mercados).
  const countryCode = app.country;
  const country = getCountry(countryCode);
  const { targets, suggested, snapshots } = await loadReviewTargets(app);
  // An app of the TOP 5 can be opened from the suggestions (or Competidores) even if nobody watches it.
  const fromTop5 = query.t && !targets.some((t) => t.storeId === query.t) ? findInTop5(snapshots, query.t) : null;
  if (fromTop5) targets.push({ storeId: fromTop5.id, title: fromTop5.title, source: "top5", icon: fromTop5.icon, rating: fromTop5.rating });
  const target = targets.find((t) => t.storeId === query.t) ?? targets[0];
  const own = target.storeId === app.storeId;
  const href = (storeId: string) => marketPath(app, storeId === app.storeId ? "/resenas" : `/resenas?t=${encodeURIComponent(storeId)}`);

  const [analyses, followed, countryAnalyses, product, freshness] = await Promise.all([
    db
      .select()
      .from(schema.reviewAnalyses)
      .where(and(eq(schema.reviewAnalyses.appId, app.id), eq(schema.reviewAnalyses.targetStoreId, target.storeId), eq(schema.reviewAnalyses.country, countryCode)))
      .orderBy(desc(schema.reviewAnalyses.createdAt))
      .limit(12),
    db
      .select({ term: schema.keywords.term })
      .from(schema.appKeywords)
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
      .where(eq(schema.appKeywords.appId, app.id)),
    // Every source's analyses in this country: the source column and «Lo que pide la categoría».
    db
      .select({
        targetStoreId: schema.reviewAnalyses.targetStoreId,
        targetTitle: schema.reviewAnalyses.targetTitle,
        stats: schema.reviewAnalyses.stats,
        result: schema.reviewAnalyses.result,
        createdAt: schema.reviewAnalyses.createdAt,
      })
      .from(schema.reviewAnalyses)
      .where(and(eq(schema.reviewAnalyses.appId, app.id), eq(schema.reviewAnalyses.country, countryCode)))
      .orderBy(desc(schema.reviewAnalyses.createdAt))
      .limit(100),
    getProductFacts(app.id),
    loadReviewFreshness(
      app.id,
      targets.map((t) => t.storeId),
    ),
  ]);
  const latestByTarget = new Map<string, (typeof countryAnalyses)[number]>();
  for (const a of countryAnalyses) if (!latestByTarget.has(a.targetStoreId)) latestByTarget.set(a.targetStoreId, a);

  const latest = analyses[0];
  // stats.count 0: the store returned no recent reviews (stored so it does not vanish on reload).
  const shown = latest && latest.stats.count > 0 ? latest : null;
  const tracked = new Set(followed.map((f) => f.term));
  const ideas = shown ? [...new Set(shown.result.keywordIdeas.map((k) => normalizeKeyword(k.keyword)))].filter((k) => k && !tracked.has(k)) : [];
  const enabled = hasAnthropicKey();
  // Statuses are checked again against today's features: a feature may have shipped or been retired since.
  const opportunities = shown && !own ? fixOpportunityStatus(shown.result.opportunities ?? [], product.features) : [];
  const suggestions = suggested.filter((s) => !targets.some((t) => t.storeId === s.storeId));

  // Latest analysis with reviews of each competitor in this country.
  const perCompetitor = withCurrentOpportunityStatus(
    [...Map.groupBy(countryAnalyses.filter((a) => a.stats.count > 0 && a.targetStoreId !== app.storeId), (a) => a.targetStoreId).values()].map((rows) => rows[0]),
    product.features,
  );
  const asks = aggregateCategoryAsks(
    perCompetitor,
    featuresFor(product.features, "published"),
    featuresFor(product.features, "next").filter((f) => f.status === "next_release"),
  );
  const covered = asks.filter((a) => a.coveredBy);
  const upcoming = asks.filter((a) => !a.coveredBy && a.nextBy);
  const future = asks.filter((a) => !a.coveredBy && !a.nextBy);

  const sources = targets.map((t) => {
    const last = latestByTarget.get(t.storeId) ?? null;
    return {
      ...t,
      lastAnalysis: last?.createdAt ?? null,
      rating: t.rating ?? (last && last.stats.count > 0 ? last.stats.average : null),
      fresh: hasNewReviews(freshness.get(t.storeId), last ? last.stats : null),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reseñas">
        Lo que dicen los usuarios en {country.name}, de tu app y de tu competencia.
      </PageHeader>

      {asks.length > 0 && (
        <Card aria-labelledby="asks-title" className="flex flex-col gap-3 p-4 sm:p-5">
          <h2 id="asks-title" className="flex items-center gap-1 text-card-title font-semibold">
            Lo que pide la categoría
            <HelpTip label="Lo que pide la categoría">
              Quejas y peticiones de los últimos análisis de {perCompetitor.length === 1 ? "1 competidor" : `${perCompetitor.length} competidores`} en {country.name},
              cruzadas por palabras con las funciones de tu ficha de producto (sin IA, salvo las marcadas «Según la IA»). Revísalo antes de usarlo.
            </HelpTip>
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <section aria-labelledby="asks-covered">
              <h3 id="asks-covered" className="mb-1 text-table font-semibold text-ink-soft">
                Ya lo resuelves → cuéntalo
              </h3>
              <AskList
                items={covered}
                showMatch="covered"
                empty={product.features.length === 0 ? "Rellena la ficha de producto para comparar." : "Nada coincide con tus funciones publicadas."}
              />
            </section>
            <section aria-labelledby="asks-next">
              <h3 id="asks-next" className="mb-1 text-table font-semibold text-ink-soft">
                Lo resuelve la próxima versión
              </h3>
              <AskList items={upcoming} showMatch="next" empty="Nada coincide con las funciones de la próxima versión." />
            </section>
            <section aria-labelledby="asks-future">
              <h3 id="asks-future" className="mb-1 text-table font-semibold text-ink-soft">
                Oportunidades
              </h3>
              <AskList items={future} showMatch={null} empty="Nada pendiente." />
            </section>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <nav aria-label="Fuentes de reseñas" className="flex min-w-0 flex-col gap-3">
          <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
            {sources.map((s) => {
              const active = s.storeId === target.storeId;
              return (
                <li key={s.storeId} className="border-b border-line last:border-0">
                  <Link
                    href={href(s.storeId)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 px-3 py-2.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                      active ? "bg-brand-soft" : "hover:bg-surface-muted",
                    )}
                  >
                    {s.icon ? <AppIcon src={s.icon} size={28} /> : <span aria-hidden="true" className="size-7 shrink-0 rounded-md bg-surface-muted" />}
                    <span className="min-w-0 flex-1">
                      <span className={cn("flex items-center gap-1.5 text-table font-medium", active ? "text-brand-strong" : "text-ink")}>
                        <span className="truncate">{s.title}</span>
                        {s.source === "own" && <span className="shrink-0 text-label font-normal text-ink-soft">(tu app)</span>}
                      </span>
                      <span className="block truncate text-label text-ink-soft">
                        {s.rating != null ? `${formatRating(s.rating)} · ` : ""}
                        {s.lastAnalysis ? `analizada el ${formatDate(s.lastAnalysis)}` : "sin analizar"}
                      </span>
                    </span>
                    {s.fresh && (
                      <span className="flex shrink-0 items-center" title="Hay reseñas nuevas desde el último análisis">
                        <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
                        <span className="sr-only">Hay reseñas nuevas</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h2 className="text-label font-medium text-ink-soft">Del TOP 5, sin analizar</h2>
              <ul className="flex flex-col gap-1">
                {suggestions.map((s) => (
                  <li key={s.storeId}>
                    <Link href={href(s.storeId)} className="flex min-h-9 items-center justify-between gap-2 rounded-control px-2 text-table text-ink hover:bg-surface-muted">
                      <span className="truncate">{s.title}</span>
                      <span className="shrink-0 text-label text-ink-soft tabular-nums">{Math.round(s.share)} %</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <Card aria-label={`Análisis de ${target.title}`} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
            <div className="min-w-0">
              <h2 className="text-card-title font-semibold">{target.title}</h2>
              <p className="text-table text-ink-soft">
                {shown
                  ? `Último análisis: ${formatDate(shown.createdAt)}, ${shown.stats.count} reseñas.`
                  : latest
                    ? `La tienda no devolvió reseñas recientes en ${country.name} (comprobado el ${formatDate(latest.createdAt)}).`
                    : `Aún no has analizado sus reseñas en ${country.name}.`}
              </p>
            </div>
            {enabled ? (
              <AnalyzeReviewsForm
                appId={app.id}
                target={target.storeId}
                country={countryCode}
                label={shown ? "Analizar de nuevo" : latest ? "Comprobar de nuevo" : "Analizar reseñas"}
              />
            ) : (
              <p className="text-table text-ink-soft">
                Para analizar reseñas, configura Claude en{" "}
                <Link href="/integraciones" className="text-link underline">
                  Integraciones
                </Link>
                .
              </p>
            )}
          </Card>

          {own &&
            app.store === "android" &&
            (playConfig().configured ? (
              <Suspense fallback={<Skeleton className="h-40" />}>
                <PlayReviews appId={app.id} packageName={app.storeId} aiEnabled={enabled} />
              </Suspense>
            ) : (
              <p className="text-[13px] text-ink-soft">
                Para leer y responder las reseñas de tu app desde aquí, conecta Google Play Console en{" "}
                <Link href="/integraciones" className="text-link underline">
                  Integraciones
                </Link>
                .
              </p>
            ))}

          {!shown ? (
            <Card>
              <EmptyState
                icon={MessageSquareText}
                title={latest ? "Sin reseñas recientes" : "Sin análisis todavía"}
                description={
                  latest
                    ? "Puede que la app sea nueva o tenga pocos usuarios en este país: prueba con un competidor."
                    : "Claude lee hasta 300 reseñas recientes y resume temas, quejas, peticiones e ideas para tu ficha."
                }
              />
            </Card>
          ) : (
            <>
              <div className="grid gap-6 xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <Card aria-label="Valoraciones" className="flex flex-col gap-2 p-4 sm:p-5">
                  <span className="text-label text-ink-soft">Media de las {shown.stats.count} reseñas leídas</span>
                  <span className="text-kpi font-semibold tabular-nums">{formatRating(shown.stats.average)}</span>
                  <span className="text-label text-muted">
                    {formatDate(shown.stats.from)} – {formatDate(shown.stats.to)}
                  </span>
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {[5, 4, 3, 2, 1].map((stars) => {
                      const n = shown.stats.distribution[stars - 1];
                      const width = shown.stats.count ? (100 * n) / shown.stats.count : 0;
                      return (
                        <li key={stars} className="flex items-center gap-2 text-[13px]">
                          <span className="w-6 text-ink-soft tabular-nums">{stars}★</span>
                          <span className="h-2 flex-1 rounded-full bg-surface-muted" aria-hidden="true">
                            <span className="block h-2 rounded-full bg-series-own" style={{ width: `${width}%` }} />
                          </span>
                          <span className="w-8 text-right tabular-nums">{n}</span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
                <Card aria-label="Resumen" className="flex flex-col gap-2 p-4 sm:p-5">
                  <h3 className="flex items-center gap-2 text-card-title font-semibold">
                    Resumen
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-label font-medium text-ink-soft">Análisis de IA</span>
                  </h3>
                  <p className="text-sm text-ink-soft">{shown.result.summary}</p>
                </Card>
              </div>

              <Card aria-label="Temas" className="flex flex-col gap-2 p-4 sm:p-5">
                <h3 className="text-card-title font-semibold">Temas</h3>
                <ul className="flex flex-col">
                  {shown.result.themes.map((t) => (
                    <li key={t.theme} className="grid gap-1.5 border-b border-line py-2.5 text-sm last:border-0 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center sm:gap-4">
                      <span className="min-w-0">
                        <span className="font-medium">{t.theme}</span>{" "}
                        <span className={cn("ml-1 rounded-full px-2 py-0.5 text-label font-medium", SENTIMENT[t.sentiment].className)}>{SENTIMENT[t.sentiment].label}</span>
                        <span className="mt-0.5 block text-[13px] text-ink-soft italic">«{t.quote}»</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-2 flex-1 rounded-full bg-surface-muted" aria-hidden="true">
                          <span className="block h-2 rounded-full bg-series-own" style={{ width: `${Math.min(100, Math.max(0, t.share))}%` }} />
                        </span>
                        <span className="w-12 text-right text-[13px] text-ink-soft tabular-nums">
                          {Math.round(t.share)} %<span className="sr-only"> de las reseñas</span>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              <ListCard
                title={own ? "Ideas para tu ficha" : "Ideas para tu ficha a partir de este competidor"}
                items={shown.result.listingTips}
                className="border-brand"
                icon={<Lightbulb size={16} aria-hidden="true" className="text-brand" />}
              />

              <div className="grid gap-6 md:grid-cols-2">
                <ListCard title="Quejas" items={shown.result.complaints} />
                <ListCard title="Peticiones" items={shown.result.requests} />
              </div>

              {!own && (
                <Card aria-label="Lo que tu app ya resuelve" className="flex flex-col gap-2 p-4 sm:p-5">
                  <h3 className="flex items-center gap-1 text-card-title font-semibold">
                    Lo que tu app ya resuelve
                    <HelpTip label="Lo que tu app ya resuelve">
                      Quejas y peticiones de los usuarios de {target.title} que tu app ya cubre, o cubrirá en la próxima versión, según la ficha de producto.
                    </HelpTip>
                  </h3>
                  {opportunities.length === 0 ? (
                    <p className="text-table text-ink-soft">
                      {product.features.length === 0
                        ? "Rellena la ficha de producto para comparar estas reseñas con lo que hace tu app."
                        : shown.result.opportunities
                          ? "Ninguna queja de estas reseñas coincide con una función de tu app."
                          : "Este análisis es anterior a las oportunidades: analiza de nuevo para verlas."}
                    </p>
                  ) : (
                    <ul className="flex flex-col">
                      {opportunities.map((o) => (
                        <li key={`${o.need}-${o.feature}`} className="border-b border-line py-2.5 text-sm last:border-0">
                          <span className="font-medium">{o.need}</span>
                          <span className="text-ink-soft">
                            {" "}
                            → {o.status === "next" ? "lo resolverá la próxima versión con" : "lo resuelve"} «{o.feature}»
                          </span>
                          <span className="mt-0.5 block text-[13px] text-ink-soft italic">«{o.quote}»</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}

              {ideas.length > 0 && (
                <Card aria-label="Palabras de los usuarios" className="overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
                    <h3 className="flex items-center gap-1 text-card-title font-semibold">
                      Palabras de los usuarios
                      <HelpTip label="Palabras de los usuarios">Frases con las que describen la app o lo que buscan. También llegan a Keywords › Encontrar.</HelpTip>
                    </h3>
                    <Link href={marketPath(app, "/encontrar?fuente=pendientes")} className="text-[13px] text-link hover:underline">
                      Ver en Encontrar →
                    </Link>
                  </div>
                  <DiscoverList appId={app.id} suggestions={ideas} countryName="" caption={`${ideas.length} ideas que aún no sigues`} source="reviews" lang={country.lang} />
                </Card>
              )}

              {analyses.filter((a) => a.stats.count > 0).length > 1 && (
                <Card aria-label="Análisis anteriores" className="flex flex-col gap-2 p-4 sm:p-5">
                  <h3 className="text-card-title font-semibold">Evolución de la media</h3>
                  <ul className="flex flex-wrap gap-2.5 text-[13px]">
                    {analyses
                      .filter((a) => a.stats.count > 0)
                      .map((a) => (
                        <li key={a.id} className="rounded-control bg-surface-muted px-3 py-1.5">
                          {formatDate(a.createdAt)} · <span className="tabular-nums">{formatRating(a.stats.average)}</span> · {a.stats.count} reseñas
                        </li>
                      ))}
                  </ul>
                </Card>
              )}

              <p className="text-xs text-muted">
                Generado con {shown.model} · prompt {shown.promptVersion}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
