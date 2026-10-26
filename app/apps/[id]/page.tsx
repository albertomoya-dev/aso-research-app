import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { refreshAppMeta, removeKeyword, unfollowApp } from "@/app/actions";
import { AppIcon } from "@/components/app-icon";
import { AppMetadata } from "@/components/app-metadata";
import { ConfirmButton } from "@/components/confirm-button";
import { KeywordForm } from "@/components/keyword-form";
import { StoreBadge } from "@/components/store-badge";
import { buttonSecondary, Card } from "@/components/ui";
import { getDb, schema } from "@/db";
import { getCountry } from "@/lib/countries";
import { formatDate } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };

const SOURCE_LABEL = { manual: "Manual", ai: "Sugerida por IA", autocomplete: "Autocompletado" } as const;

async function loadApp(id: string) {
  const appId = Number(id);
  if (!Number.isInteger(appId) || appId <= 0) notFound();
  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) notFound();
  return app;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const app = await loadApp((await params).id);
  return { title: app.title };
}

export default async function AppPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const keywords = await getDb()
    .select({
      id: schema.keywords.id,
      term: schema.keywords.term,
      source: schema.appKeywords.source,
      addedAt: schema.appKeywords.createdAt,
    })
    .from(schema.appKeywords)
    .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
    .where(eq(schema.appKeywords.appId, app.id))
    .orderBy(desc(schema.appKeywords.createdAt), schema.keywords.term);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <AppIcon src={app.icon} size={56} />
          <div>
            <h1 className="text-2xl font-bold">{app.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <StoreBadge store={app.store} country={app.country} />
              <span>{getCountry(app.country).name}</span>
              <span>· Ficha leída el {formatDate(app.metaFetchedAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <form action={refreshAppMeta}>
            <input type="hidden" name="appId" value={app.id} />
            <button type="submit" className={buttonSecondary}>
              Actualizar ficha
            </button>
          </form>
          <form action={unfollowApp}>
            <input type="hidden" name="appId" value={app.id} />
            <ConfirmButton
              message={`¿Dejar de seguir ${app.title}? Se borrarán sus keywords y su histórico.`}
              className={`${buttonSecondary} text-danger`}
            >
              Dejar de seguir
            </ConfirmButton>
          </form>
        </div>
      </header>

      <Card aria-label="Añadir keywords" className="px-6 py-5">
        <KeywordForm appId={app.id} />
      </Card>

      <Card aria-label="Keywords" className="overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
          <h2 className="text-[17px] font-semibold">Keywords ({keywords.length})</h2>
          <span className="text-[13px] text-muted">La posición diaria y el TOP 5 llegan en el paso 2.</span>
        </div>
        {keywords.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">Aún no hay keywords. Añade las primeras arriba.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wider text-muted uppercase">
                  <th scope="col" className="px-5 py-3 font-semibold">Keyword</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Origen</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Posición</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Añadida</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((k) => (
                  <tr key={k.id} className="border-t border-line">
                    <td className="px-5 py-3 font-semibold">{k.term}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-soft">
                        {SOURCE_LABEL[k.source]}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-muted">Pendiente</td>
                    <td className="px-3 py-3 text-muted">{formatDate(k.addedAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <form action={removeKeyword}>
                        <input type="hidden" name="appId" value={app.id} />
                        <input type="hidden" name="keywordId" value={k.id} />
                        <button
                          type="submit"
                          aria-label={`Quitar ${k.term}`}
                          className="min-h-11 rounded-lg px-3 text-[13px] font-medium text-danger hover:bg-danger-soft"
                        >
                          Quitar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card aria-label="Ficha publicada" className="p-6">
        <AppMetadata meta={app.meta} />
      </Card>
    </div>
  );
}
