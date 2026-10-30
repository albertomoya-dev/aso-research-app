import { and, desc, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AnalyzeReviewsForm } from "@/components/analyze-reviews-form";
import { CountrySelect } from "@/components/country-select";
import { DiscoverList } from "@/components/discover-list";
import { PlayReviews } from "@/components/play-reviews";
import { buttonSecondary, Card, PageHeader, Skeleton } from "@/components/ui";
import { getDb, schema } from "@/db";
import { loadApp } from "@/lib/apps";
import { hasAnthropicKey } from "@/lib/claude";
import { getCountry, isCountry } from "@/lib/countries";
import { formatDate, formatRating } from "@/lib/format";
import { normalizeKeyword } from "@/lib/keywords";
import { playConfig } from "@/lib/play-console/auth";
import { featuresFor } from "@/lib/product-facts";
import { getProductFacts } from "@/lib/product-queries";
import { aggregateCategoryAsks } from "@/lib/review-analysis";
import { findInTop5, loadReviewTargets } from "@/lib/review-queries";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; c?: string }> };

export const metadata: Metadata = { title: "Reseñas" };
// Reading up to 300 reviews and asking Claude can take a minute.
export const maxDuration = 120;

const SENTIMENT = {
  positive: { label: "Positivo", className: "bg-android-bg text-android-fg" },
  negative: { label: "Negativo", className: "bg-danger-soft text-danger" },
  mixed: { label: "Mixto", className: "bg-warn-bg text-warn-fg" },
} as const;

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <Card className="px-5 py-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nada destacable.</p>
      ) : (
        <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink-soft">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export default async function ReviewsPage({ params, searchParams }: Props) {
  const app = await loadApp((await params).id);
  const db = getDb();
  const query = await searchParams;
  const countryCode = query.c && isCountry(query.c) ? query.c.toLowerCase() : app.country;
  const country = getCountry(countryCode);
  const { targets, suggested, snapshots } = await loadReviewTargets(app);
  // An app of the TOP 5 can be opened from the suggestions even if nobody watches it.
  const fromTop5 = query.t && !targets.some((t) => t.storeId === query.t) ? findInTop5(snapshots, query.t) : null;
  if (fromTop5) targets.push({ storeId: fromTop5.id, title: fromTop5.title, source: "top5" });
  const target = targets.find((t) => t.storeId === query.t) ?? targets[0];
  const own = target.storeId === app.storeId;
  const href = (storeId: string, c = countryCode) =>
    `/apps/${app.id}/resenas?t=${encodeURIComponent(storeId)}${c !== app.country ? `&c=${c}` : ""}`;

  const [analyses, followed, competitorAnalyses, product] = await Promise.all([
    db
      .select()
      .from(schema.reviewAnalyses)
      .where(
        and(
          eq(schema.reviewAnalyses.appId, app.id),
          eq(schema.reviewAnalyses.targetStoreId, target.storeId),
          eq(schema.reviewAnalyses.country, countryCode),
        ),
      )
      .orderBy(desc(schema.reviewAnalyses.createdAt))
      .limit(12),
    db
      .select({ term: schema.keywords.term })
      .from(schema.appKeywords)
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
      .where(eq(schema.appKeywords.appId, app.id)),
    db
      .select({
        targetStoreId: schema.reviewAnalyses.targetStoreId,
        targetTitle: schema.reviewAnalyses.targetTitle,
        stats: schema.reviewAnalyses.stats,
        result: schema.reviewAnalyses.result,
      })
      .from(schema.reviewAnalyses)
      .where(
        and(
          eq(schema.reviewAnalyses.appId, app.id),
          ne(schema.reviewAnalyses.targetStoreId, app.storeId),
          eq(schema.reviewAnalyses.country, countryCode),
        ),
      )
      .orderBy(desc(schema.reviewAnalyses.createdAt))
      .limit(100),
    getProductFacts(app.id),
  ]);
  const latest = analyses[0];
  // stats.count 0: the store returned no recent reviews (stored so it does not vanish on reload).
  const shown = latest && latest.stats.count > 0 ? latest : null;
  const tracked = new Set(followed.map((f) => f.term));
  const ideas = shown
    ? [...new Set(shown.result.keywordIdeas.map((k) => normalizeKeyword(k.keyword)))].filter((k) => k && !tracked.has(k))
    : [];
  const enabled = hasAnthropicKey();
  const opportunities = shown && !own ? (shown.result.opportunities ?? []) : [];
  const suggestions = suggested.filter((s) => s.storeId !== target.storeId);

  // Latest analysis with reviews of each competitor in this country.
  const perCompetitor = [...Map.groupBy(competitorAnalyses.filter((a) => a.stats.count > 0), (a) => a.targetStoreId).values()].map((rows) => rows[0]);
  const asks = aggregateCategoryAsks(perCompetitor, featuresFor(product.features, "published"));
  const covered = asks.filter((a) => a.coveredBy);
  const future = asks.filter((a) => !a.coveredBy);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Reseñas
      </nav>
      <PageHeader title="Qué dicen las reseñas">
        Claude lee las reseñas más recientes del país que elijas (hasta 300) y resume temas, quejas y peticiones, y las palabras con las que los
        usuarios describen la app. Puedes analizar tu app, los competidores que vigilas o cualquier app de tu TOP 5.
      </PageHeader>

      <div className="flex flex-wrap items-end justify-between gap-3">
        {targets.length > 1 ? (
          <nav aria-label="App a analizar" className="flex flex-wrap gap-2">
            {targets.map((t) => {
              const active = t.storeId === target.storeId;
              return (
                <Link
                  key={t.storeId}
                  href={href(t.storeId)}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-medium ${
                    active ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-soft hover:bg-surface-muted"
                  }`}
                >
                  {t.title}
                  {t.source === "own" && " (tu app)"}
                  {t.source === "top5" && " (TOP 5)"}
                </Link>
              );
            })}
          </nav>
        ) : (
          <span />
        )}
        <form method="get" className="flex items-end gap-2">
          <input type="hidden" name="t" value={target.storeId} />
          <CountrySelect name="c" defaultValue={countryCode} />
          <button type="submit" className={buttonSecondary}>
            Cambiar país
          </button>
        </form>
      </div>

      {enabled ? (
        <Card className="flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              {shown
                ? `Último análisis de ${target.title} en ${country.name}: ${formatDate(shown.createdAt)}.`
                : latest
                  ? `La tienda no devolvió reseñas recientes de ${target.title} en ${country.name} (comprobado el ${formatDate(latest.createdAt)}). Puede que la app sea nueva o tenga pocos usuarios aquí: prueba otro país o un competidor.`
                  : `Aún no has analizado las reseñas de ${target.title} en ${country.name}.`}
            </p>
            <AnalyzeReviewsForm
              appId={app.id}
              target={target.storeId}
              country={countryCode}
              label={shown ? "Analizar de nuevo" : latest ? "Comprobar de nuevo" : "Analizar reseñas"}
            />
          </div>
          {!shown && suggestions.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="text-[13px] text-muted">
                Las reseñas de la competencia dicen qué echan de menos sus usuarios. Estas son las apps con más visibilidad en tu TOP 5:
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <li key={s.storeId}>
                    <Link href={href(s.storeId)} className={buttonSecondary}>
                      {s.title} <span className="font-mono text-muted">{Math.round(s.share)}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ) : (
        <Card className="px-5 py-4 text-sm text-ink-soft">
          Para analizar reseñas añade <code className="font-mono">ANTHROPIC_API_KEY</code> en las variables de entorno.
        </Card>
      )}

      {own && app.store === "android" &&
        (playConfig().configured ? (
          <Suspense fallback={<Skeleton className="h-40" />}>
            <PlayReviews appId={app.id} packageName={app.storeId} aiEnabled={enabled} />
          </Suspense>
        ) : (
          <p className="text-[13px] text-muted">
            Para leer y responder las reseñas de tu app desde aquí, conecta Google Play Console (README, sección «Google Play Console»).
          </p>
        ))}

      {shown && (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <Card aria-label="Valoraciones" className="px-5 py-4">
              <div className="text-xs text-muted">Media de las {shown.stats.count} reseñas leídas</div>
              <div className="font-mono text-2xl font-semibold">{formatRating(shown.stats.average)}</div>
              <div className="mt-1 text-xs text-muted">
                {formatDate(shown.stats.from)} – {formatDate(shown.stats.to)}
              </div>
              <ul className="mt-3 flex flex-col gap-1.5">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const n = shown.stats.distribution[stars - 1];
                  const width = shown.stats.count ? (100 * n) / shown.stats.count : 0;
                  return (
                    <li key={stars} className="flex items-center gap-2 text-[13px]">
                      <span className="w-6 font-mono text-muted">{stars}★</span>
                      <span className="h-2 flex-1 rounded-full bg-surface-muted" aria-hidden="true">
                        <span className="block h-2 rounded-full bg-brand" style={{ width: `${width}%` }} />
                      </span>
                      <span className="w-8 text-right font-mono">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card aria-label="Resumen" className="px-5 py-4">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[15px] font-semibold">Resumen</h2>
                <span className="rounded-md bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-fg">Análisis de IA</span>
              </div>
              <p className="mt-2 text-sm text-ink-soft">{shown.result.summary}</p>
              <h3 className="mt-4 text-[13px] font-semibold text-ink-soft">Temas</h3>
              <ul className="mt-1.5 flex flex-col">
                {shown.result.themes.map((t) => (
                  <li key={t.theme} className="grid gap-1 border-b border-line py-2.5 text-sm last:border-0 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <span>
                      <span className="font-medium">{t.theme}</span>{" "}
                      <span className={`ml-1 rounded px-1.5 py-0.5 text-xs font-semibold ${SENTIMENT[t.sentiment].className}`}>
                        {SENTIMENT[t.sentiment].label}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-muted italic">«{t.quote}»</span>
                    </span>
                    <span className="font-mono text-[13px] text-muted sm:text-right">~{Math.round(t.share)}% de las reseñas</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <List title="Quejas más repetidas" items={shown.result.complaints} />
            <List title="Lo que piden" items={shown.result.requests} />
            <List title={own ? "Ideas para tu ficha" : "Ideas para tu ficha a partir de este competidor"} items={shown.result.listingTips} />
          </div>

          {!own && (
            <Card aria-label="Oportunidades para tu ficha" className="px-5 py-4">
              <h2 className="text-[15px] font-semibold">Lo que tu app ya resuelve</h2>
              <p className="mt-1 text-[13px] text-muted">
                Quejas y peticiones de los usuarios de {target.title} que tu app ya cubre según la ficha de producto. Es material para el texto y las
                capturas de tu ficha.
              </p>
              {opportunities.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  {product.features.length === 0
                    ? "Rellena la ficha de producto (pestaña Producto) para que Claude pueda comparar estas reseñas con lo que hace tu app."
                    : shown.result.opportunities
                      ? "Ninguna queja de estas reseñas coincide con una función de tu app."
                      : "Este análisis es anterior a las oportunidades: analiza de nuevo para verlas."}
                </p>
              ) : (
                <ul className="mt-2 flex flex-col">
                  {opportunities.map((o) => (
                    <li key={`${o.need}-${o.feature}`} className="border-b border-line py-2.5 text-sm last:border-0">
                      <span className="font-medium">{o.need}</span>
                      <span className="text-ink-soft"> → lo resuelve «{o.feature}»</span>
                      <span className="mt-0.5 block text-[13px] text-muted italic">«{o.quote}»</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {ideas.length > 0 && countryCode === app.country && (
            <Card aria-label="Keywords desde las reseñas" className="overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-[15px] font-semibold">Palabras que usan los usuarios</h2>
                <p className="mt-1 text-[13px] text-muted">Frases con las que describen la app o lo que buscan. Marca las que quieras seguir como keywords.</p>
              </div>
              <DiscoverList appId={app.id} suggestions={ideas} countryName="" caption={`${ideas.length} ideas que aún no sigues`} source="ai" lang={getCountry(app.country).lang} />
            </Card>
          )}

          {analyses.filter((a) => a.stats.count > 0).length > 1 && (
            <Card aria-label="Análisis anteriores" className="px-5 py-4">
              <h2 className="text-[15px] font-semibold">Evolución de la media</h2>
              <ul className="mt-2 flex flex-wrap gap-2.5 text-[13px]">
                {analyses
                  .filter((a) => a.stats.count > 0)
                  .map((a) => (
                    <li key={a.id} className="rounded-lg bg-surface-muted px-3 py-1.5">
                      {formatDate(a.createdAt)} · <span className="font-mono">{formatRating(a.stats.average)}</span> · {a.stats.count} reseñas
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

      {asks.length > 0 && (
        <Card aria-label="Lo que piden los usuarios de la categoría" className="px-5 py-4">
          <h2 className="text-[15px] font-semibold">Lo que piden los usuarios de la categoría</h2>
          <p className="mt-1 text-[13px] text-muted">
            Quejas y peticiones de los últimos análisis de {perCompetitor.length === 1 ? "1 competidor" : `${perCompetitor.length} competidores`} en{" "}
            {country.name}. Se marcan como cubiertas cuando coinciden con una función publicada de tu ficha de producto (por palabras, sin IA:
            revísalo antes de usarlo).
          </p>
          <div className="mt-3 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-[13px] font-semibold text-ink-soft">Ya lo resuelves: cuéntalo en la ficha</h3>
              {covered.length === 0 ? (
                <p className="mt-1.5 text-sm text-muted">
                  {product.features.length === 0 ? "Rellena la ficha de producto para comparar." : "Nada coincide con tus funciones publicadas."}
                </p>
              ) : (
                <ul className="mt-1.5 flex flex-col">
                  {covered.map((a) => (
                    <li key={a.text} className="border-b border-line py-2 text-sm last:border-0">
                      {a.text} <span className="text-ink-soft">→ «{a.coveredBy}»</span>
                      <span className="block text-xs text-muted">{a.apps.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-ink-soft">Posibles funciones futuras</h3>
              {future.length === 0 ? (
                <p className="mt-1.5 text-sm text-muted">Nada pendiente.</p>
              ) : (
                <ul className="mt-1.5 flex flex-col">
                  {future.map((a) => (
                    <li key={a.text} className="border-b border-line py-2 text-sm last:border-0">
                      {a.text}
                      <span className="block text-xs text-muted">
                        {a.kind === "request" ? "Petición" : "Queja"} · {a.apps.join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
