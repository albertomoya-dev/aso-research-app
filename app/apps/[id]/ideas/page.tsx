import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { GenerateIdeasForm } from "@/components/generate-ideas-form";
import { IdeasList } from "@/components/ideas-list";
import { StoreBadge } from "@/components/store-badge";
import { Card, PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { loadApp } from "@/lib/apps";
import { hasAnthropicKey } from "@/lib/claude";
import { getCountry } from "@/lib/countries";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Ideas con IA" };
// Claude can take a minute to think through the listing.
export const maxDuration = 120;

export default async function IdeasPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const pending = await getDb()
    .select()
    .from(schema.aiSuggestions)
    .where(and(eq(schema.aiSuggestions.appId, app.id), eq(schema.aiSuggestions.status, "pending")))
    .orderBy(desc(schema.aiSuggestions.relevance), desc(schema.aiSuggestions.createdAt));
  const enabled = hasAnthropicKey();

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Ideas con IA
      </nav>
      <PageHeader title={`Ideas de keywords para ${app.title}`}>
        Claude lee tu ficha, tus keywords, el autocompletado de la tienda y las apps que salen en tu TOP 5, y propone keywords nuevas. La
        relevancia y la competencia son estimaciones de la IA, no datos de la tienda: la popularidad real la medimos al seguir la keyword.
      </PageHeader>

      {enabled ? (
        <Card className="px-5 py-4">
          <GenerateIdeasForm appId={app.id} />
          <p className="mt-2 flex items-center gap-2 text-[13px] text-muted">
            Para <StoreBadge store={app.store} country={app.country} /> en {getCountry(app.country).name}. Tarda entre 20 segundos y un minuto.
          </p>
        </Card>
      ) : (
        <Card className="px-5 py-4 text-sm">
          <h2 className="font-semibold">Falta la clave de Anthropic</h2>
          <p className="mt-1.5 text-ink-soft">
            Añade <code className="font-mono">ANTHROPIC_API_KEY</code> en las variables de entorno (en Vercel: Settings → Environment Variables) y
            vuelve a desplegar; en <Link href="/ajustes" className="text-link hover:underline">Ajustes</Link> puedes comprobar si la clave funciona. Mientras tanto puedes añadir keywords a mano o desde{" "}
            <Link href={`/apps/${app.id}/descubrir`} className="text-link hover:underline">
              Descubrir keywords
            </Link>
            .
          </p>
        </Card>
      )}

      {pending.length > 0 && (
        <Card aria-label="Ideas pendientes" className="overflow-hidden">
          <IdeasList
            appId={app.id}
            ideas={pending.map((s) => ({
              id: s.id,
              term: s.term,
              intent: s.intent,
              relevance: s.relevance,
              competition: s.estimatedCompetition,
              reason: s.reason,
            }))}
            generatedBy={`${pending[0].model} · prompt ${pending[0].promptVersion}`}
          />
        </Card>
      )}
      {enabled && pending.length === 0 && (
        <p className="text-center text-sm text-muted">No hay ideas pendientes. Genera unas cuantas y elige las que quieras seguir.</p>
      )}
    </div>
  );
}
