import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AddKeywordsDialog } from "@/components/add-keywords-dialog";
import { officialPeriod } from "@/components/official-stats";
import { KeywordTable } from "@/components/keyword-table";
import { RefreshWhilePending } from "@/components/relevance-select";
import { PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpTip } from "@/components/ui/help-tip";
import { hasAnthropicKey } from "@/lib/claude";
import { watchedStoreIds } from "@/lib/competitor-queries";
import { getCountry } from "@/lib/countries";
import { loadKeywordPanel } from "@/lib/keyword-panel";
import { isKeywordSort, KEYWORD_SORTS, type KeywordSort, type SortDir } from "@/lib/keyword-sort";
import { legacyFilter } from "@/lib/keyword-table";
import { loadMarketParams, marketPath } from "@/lib/products";
import { getKeywordRows } from "@/lib/queries";
import { countProgress, KEYWORD_BUDGET, RELEVANCE_PROGRESS_LABEL, relevanceProgress } from "@/lib/relevance";
import { getOfficialStats } from "@/lib/search-term-queries";

// Adding keywords (a Server Action of this page) rates them with the AI and may keep doing it after
// the response (`after`): this is the time it gets.
export const maxDuration = 120;

type Props = {
  params: Promise<{ app: string; market: string }>;
  /** f: old filter links (`?f=noise`); s/d: sort; q: search; k: the keyword whose detail panel is open. */
  searchParams: Promise<{ f?: string; s?: string; d?: string; q?: string; k?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const app = await loadMarketParams(params);
  return { title: app.title };
}

export default async function KeywordsPage({ params, searchParams }: Props) {
  const app = await loadMarketParams(params);
  const { f, s, d, q, k } = await searchParams;
  const sort: KeywordSort = isKeywordSort(s) ? s : "opportunity";
  const dir: SortDir = d === "asc" || d === "desc" ? d : KEYWORD_SORTS[sort].dir;
  const country = getCountry(app.country);
  const panelId = Number(k);
  const [rows, official, watched, panel] = await Promise.all([
    getKeywordRows(app),
    app.store === "android" ? getOfficialStats(app.id) : null,
    watchedStoreIds(app.id),
    Number.isSafeInteger(panelId) && panelId > 0 ? loadKeywordPanel(app, panelId) : null,
  ]);
  const aiEnabled = hasAnthropicKey();
  const progress = new Map(rows.map((r) => [r.id, relevanceProgress(r, aiEnabled)]));
  const counts = countProgress([...progress.values()]);
  const waiting = counts.failed + counts.queued + counts.off;
  const progressLabel = Object.fromEntries(
    [...progress].flatMap(([id, p]) => (p !== "set" ? [[id, RELEVANCE_PROGRESS_LABEL[p]] as const] : [])),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Seguimiento" actions={<AddKeywordsDialog appId={app.id} />}>
        Tus keywords en {country.name}.{" "}
        <Link href={marketPath(app, "/ficha#publicada")} className="text-link underline">
          Ver la ficha publicada
        </Link>
      </PageHeader>

      {(counts.calculating > 0 || waiting > 0 || rows.length > KEYWORD_BUDGET) && (
        <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-soft">
          {counts.calculating > 0 && (
            <span>
              La IA está valorando {counts.calculating === 1 ? "1 keyword" : `${counts.calculating} keywords`}.
              <RefreshWhilePending />
            </span>
          )}
          {waiting > 0 && (
            <span className="inline-flex items-center gap-1 text-warn-fg">
              {waiting === 1 ? "1 keyword sin relevancia" : `${waiting} keywords sin relevancia`}
              <HelpTip label="Keywords sin relevancia">
                Cuentan como 0,7 en la oportunidad.{" "}
                {counts.off > 0
                  ? "Falta ANTHROPIC_API_KEY para que la estime la IA; puedes valorarlas a mano."
                  : "La consulta diaria las vuelve a intentar; para no esperar, selecciónalas y pulsa «Recalcular con IA»."}
              </HelpTip>
            </span>
          )}
          {rows.length > KEYWORD_BUDGET && (
            <span className="inline-flex items-center gap-1 text-warn-fg">
              Sigues {rows.length} keywords (recomendado: {KEYWORD_BUDGET} como máximo)
              <HelpTip label="Demasiadas keywords">
                Por encima de {KEYWORD_BUDGET}, las alertas y la cuota de visibilidad pierden precisión. Filtra por Relevancia › «Probablemente
                irrelevante» y quita las que no te aporten.
              </HelpTip>
            </span>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={KeyRound}
            title="Aún no sigues keywords"
            description="Añade las primeras a mano o búscalas en Encontrar."
            action={
              <Link href={marketPath(app, "/encontrar")} className="text-[13px] text-link hover:underline">
                Ir a Encontrar
              </Link>
            }
          />
        </div>
      ) : (
        <KeywordTable
          appId={app.id}
          basePath={marketPath(app)}
          rows={rows}
          lang={country.lang}
          countryName={country.name}
          store={app.store}
          ownStoreId={app.storeId}
          watched={[...watched]}
          aiEnabled={aiEnabled}
          official={official ? { period: officialPeriod(official), byTerm: Object.fromEntries([...official.byTerm].map(([t, v]) => [t, v.visitors])) } : null}
          progressLabel={progressLabel}
          initial={{ facets: legacyFilter(f), sort, dir, q: (q ?? "").slice(0, 60) }}
          initialPanel={panel}
          fileName={`keywords-${app.productSlug}-${app.country}`}
        />
      )}
    </div>
  );
}
