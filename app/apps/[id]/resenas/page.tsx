import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AnalyzeReviewsForm } from "@/components/analyze-reviews-form";
import { DiscoverList } from "@/components/discover-list";
import { Card, PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { loadApp } from "@/lib/apps";
import { hasAnthropicKey } from "@/lib/claude";
import { getCountry } from "@/lib/countries";
import { formatDate, formatRating } from "@/lib/format";
import { normalizeKeyword } from "@/lib/keywords";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> };

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
  const competitors = await db
    .select({ storeId: schema.competitors.storeId, title: schema.competitors.title })
    .from(schema.competitors)
    .where(eq(schema.competitors.appId, app.id))
    .orderBy(schema.competitors.title);
  const targets = [{ storeId: app.storeId, title: app.title }, ...competitors];
  const requested = (await searchParams).t;
  const target = targets.find((t) => t.storeId === requested) ?? targets[0];

  const [analyses, followed] = await Promise.all([
    db
      .select()
      .from(schema.reviewAnalyses)
      .where(and(eq(schema.reviewAnalyses.appId, app.id), eq(schema.reviewAnalyses.targetStoreId, target.storeId)))
      .orderBy(desc(schema.reviewAnalyses.createdAt))
      .limit(12),
    db
      .select({ term: schema.keywords.term })
      .from(schema.appKeywords)
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
      .where(eq(schema.appKeywords.appId, app.id)),
  ]);
  const latest = analyses[0];
  const tracked = new Set(followed.map((f) => f.term));
  const ideas = latest
    ? [...new Set(latest.result.keywordIdeas.map((k) => normalizeKeyword(k.keyword)))].filter((k) => k && !tracked.has(k))
    : [];
  const enabled = hasAnthropicKey();
  const own = target.storeId === app.storeId;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-brand hover:underline">
          {app.title}
        </Link>{" "}
        / Reseñas
      </nav>
      <PageHeader title="Qué dicen las reseñas">
        Claude lee las reseñas más recientes de {getCountry(app.country).name} (hasta 300) y resume temas, quejas y peticiones, y las palabras con las que
        los usuarios describen la app. Puedes analizar tu app o las de los competidores que vigilas.
      </PageHeader>

      {targets.length > 1 && (
        <nav aria-label="App a analizar" className="flex flex-wrap gap-2">
          {targets.map((t) => {
            const active = t.storeId === target.storeId;
            return (
              <Link
                key={t.storeId}
                href={`/apps/${app.id}/resenas?t=${encodeURIComponent(t.storeId)}`}
                aria-current={active ? "true" : undefined}
                className={`inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-medium ${
                  active ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-soft hover:bg-surface-muted"
                }`}
              >
                {t.title}
                {t.storeId === app.storeId && " (tu app)"}
              </Link>
            );
          })}
        </nav>
      )}

      {enabled ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-sm text-ink-soft">
            {latest ? `Último análisis de ${target.title}: ${formatDate(latest.createdAt)}.` : `Aún no has analizado las reseñas de ${target.title}.`}
          </p>
          <AnalyzeReviewsForm appId={app.id} target={target.storeId} label={latest ? "Analizar de nuevo" : "Analizar reseñas"} />
        </Card>
      ) : (
        <Card className="px-5 py-4 text-sm text-ink-soft">
          Para analizar reseñas añade <code className="font-mono">ANTHROPIC_API_KEY</code> en las variables de entorno.
        </Card>
      )}

      {latest && (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <Card aria-label="Valoraciones" className="px-5 py-4">
              <div className="text-xs text-muted">Media de las {latest.stats.count} reseñas leídas</div>
              <div className="font-mono text-2xl font-semibold">{formatRating(latest.stats.average)}</div>
              <div className="mt-1 text-xs text-muted">
                {formatDate(latest.stats.from)} – {formatDate(latest.stats.to)}
              </div>
              <ul className="mt-3 flex flex-col gap-1.5">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const n = latest.stats.distribution[stars - 1];
                  const width = latest.stats.count ? (100 * n) / latest.stats.count : 0;
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
              <p className="mt-2 text-sm text-ink-soft">{latest.result.summary}</p>
              <h3 className="mt-4 text-[13px] font-semibold text-ink-soft">Temas</h3>
              <ul className="mt-1.5 flex flex-col">
                {latest.result.themes.map((t) => (
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
            <List title="Quejas más repetidas" items={latest.result.complaints} />
            <List title="Lo que piden" items={latest.result.requests} />
            <List title={own ? "Ideas para tu ficha" : "Ideas para tu ficha a partir de este competidor"} items={latest.result.listingTips} />
          </div>

          {ideas.length > 0 && (
            <Card aria-label="Keywords desde las reseñas" className="overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-[15px] font-semibold">Palabras que usan los usuarios</h2>
                <p className="mt-1 text-[13px] text-muted">Frases con las que describen la app o lo que buscan. Marca las que quieras seguir como keywords.</p>
              </div>
              <DiscoverList appId={app.id} suggestions={ideas} countryName="" caption={`${ideas.length} ideas que aún no sigues`} source="ai" />
            </Card>
          )}

          {analyses.length > 1 && (
            <Card aria-label="Análisis anteriores" className="px-5 py-4">
              <h2 className="text-[15px] font-semibold">Evolución de la media</h2>
              <ul className="mt-2 flex flex-wrap gap-2.5 text-[13px]">
                {analyses.map((a) => (
                  <li key={a.id} className="rounded-lg bg-surface-muted px-3 py-1.5">
                    {formatDate(a.createdAt)} · <span className="font-mono">{formatRating(a.stats.average)}</span> · {a.stats.count} reseñas
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <p className="text-xs text-muted">
            Generado con {latest.model} · prompt {latest.promptVersion}
          </p>
        </>
      )}
    </div>
  );
}
