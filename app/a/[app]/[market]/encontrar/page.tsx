import { Inbox, Lightbulb, Search, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon } from "@/components/app-icon";
import { CandidateList } from "@/components/candidate-list";
import { GenerateIdeasForm } from "@/components/generate-ideas-form";
import { StoreBadge } from "@/components/store-badge";
import { buttonSecondary, ErrorNote, inputClass, PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpTip } from "@/components/ui/help-tip";
import { getCandidateContext, syncReviewCandidates } from "@/lib/candidate-queries";
import { autocompleteCandidates, type Candidate, type FindTab, isFindTab, mergeCandidates, storedCandidates } from "@/lib/candidates";
import { hasAnthropicKey } from "@/lib/claude";
import { cn } from "@/lib/cn";
import { getCountry } from "@/lib/countries";
import { discoveryPrefixes } from "@/lib/discover";
import { normalizeKeyword } from "@/lib/keywords";
import { loadMarketParams, marketPath } from "@/lib/products";
import { getAdapter } from "@/lib/stores";
import { fetchTopApps } from "@/lib/top-apps";
import { extractTopTerms, MAX_SEED_KEYWORDS, TOP_DEPTH, toTopListing } from "@/lib/top-keywords";

// Keywords › Encontrar (phase 29): one seed or topic and three sources (autocomplete, AI ideas, TOP 10)
// that all give the same candidate list, plus the pending tray (AI ideas and review words not decided
// yet). The old /descubrir, /ideas and /top10 answer with a 308 here (next.config.ts), so their query
// (`seed`, `kw`, `term`) is still read.

type Props = {
  params: Promise<{ app: string; market: string }>;
  searchParams: Promise<{ fuente?: string; seed?: string; kw?: string; term?: string }>;
};

export const metadata: Metadata = { title: "Encontrar keywords" };
// Claude can take a minute to think through the listing, and «Medir popularidad» types up to 160 prefixes.
export const maxDuration = 120;

const ALL = "all";

const TAB_LABEL: Record<FindTab, string> = {
  pendientes: "Pendientes",
  autocompletado: "Autocompletado",
  ia: "Ideas con IA",
  top10: "TOP 10",
};

export default async function FindPage({ params, searchParams }: Props) {
  const app = await loadMarketParams(params);
  const query = await searchParams;
  const country = getCountry(app.country);
  const aiEnabled = hasAnthropicKey();
  // Review words arrive before reading, so the tray and its counter include them.
  await syncReviewCandidates(app).catch((err) => console.error("syncReviewCandidates", err));
  const ctx = await getCandidateContext(app.id);
  const merge = (lists: Candidate[][]) => mergeCandidates(lists, { followed: ctx.followed, dismissed: ctx.dismissed, measured: ctx.measured });
  const pending = merge([ctx.ai, storedCandidates(ctx.stored)]);

  const seed = normalizeKeyword(query.seed ?? query.term ?? "").slice(0, 60);
  const tab: FindTab = isFindTab(query.fuente) ? query.fuente : seed || query.kw ? "autocompletado" : pending.length > 0 ? "pendientes" : "autocompletado";
  const href = (t: FindTab) => {
    const q = new URLSearchParams({ fuente: t });
    if (seed) q.set("seed", seed);
    return marketPath(app, `/encontrar?${q}`);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Encontrar keywords">
        <span className="inline-flex flex-wrap items-center gap-2">
          <StoreBadge store={app.store} country={app.country} /> {country.name}
        </span>
      </PageHeader>

      <form className="flex flex-wrap items-end gap-2" role="search">
        <input type="hidden" name="fuente" value={tab === "pendientes" ? "autocompletado" : tab} />
        <label className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5 text-label font-medium text-ink-soft">
          <span className="inline-flex items-center gap-1">
            Semilla o tema
            <HelpTip label="Semilla o tema" side="bottom">
              Autocompletado: lo que la gente completa en el buscador tras la semilla y cada letra de la «a» a la «z». Ideas con IA: el
              enfoque de las ideas. TOP 10: la búsqueda cuyas 10 primeras apps se leen.
            </HelpTip>
          </span>
          <input type="search" name="seed" defaultValue={seed} maxLength={60} placeholder="correr" className={inputClass} list="followed-keywords" />
          <datalist id="followed-keywords">
            {ctx.followed.slice(0, 200).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <button type="submit" className={buttonSecondary}>
          <Search size={16} aria-hidden="true" />
          Buscar
        </button>
      </form>

      <nav aria-label="Fuentes de keywords" className="relative inline-flex max-w-full items-center gap-0.5 self-start overflow-x-auto rounded-control bg-surface-muted p-0.5">
        {(["pendientes", "autocompletado", "ia", "top10"] as const).map((t) => (
          <Link
            key={t}
            href={href(t)}
            aria-current={t === tab ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-[6px] px-3 text-table font-medium whitespace-nowrap md:min-h-7",
              t === tab ? "bg-surface text-ink shadow-[0_0_0_1px_var(--line)]" : "text-ink-soft hover:text-ink",
            )}
          >
            {TAB_LABEL[t]}
            {t === "pendientes" && pending.length > 0 && <span className="font-mono text-label text-muted tabular-nums">{pending.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "pendientes" && (
        pending.length === 0 ? (
          <EmptyState icon={Inbox} title="Nada pendiente" description="Las ideas con IA y las palabras de las reseñas que aún no has decidido aparecen aquí." />
        ) : (
          <CandidateList appId={app.id} candidates={pending} lang={country.lang} aiEnabled={aiEnabled} showSource fileName={`keywords-pendientes-${app.store}-${app.country}`} label="Candidatas pendientes" />
        )
      )}

      {tab === "autocompletado" && <AutocompleteSource app={app} seed={seed} lang={country.lang} countryName={country.name} aiEnabled={aiEnabled} merge={merge} />}

      {tab === "ia" && (
        <>
          {aiEnabled ? (
            <GenerateIdeasForm appId={app.id} focus={seed} />
          ) : (
            <ErrorNote>
              Falta ANTHROPIC_API_KEY: revísala en{" "}
              <Link href="/integraciones" className="underline">
                Integraciones
              </Link>
              .
            </ErrorNote>
          )}
          {(() => {
            const ideas = merge([ctx.ai]);
            return ideas.length === 0 ? (
              <EmptyState icon={Lightbulb} title="Sin ideas pendientes" description="Claude lee tu ficha, tus keywords y tu TOP 5 y propone keywords nuevas." />
            ) : (
              <>
                <CandidateList appId={app.id} candidates={ideas} lang={country.lang} aiEnabled={false} fileName={`keywords-ia-${app.store}-${app.country}`} label="Ideas con IA" />
                {ctx.aiGeneratedBy && <p className="text-label text-muted">Generado con {ctx.aiGeneratedBy}</p>}
              </>
            );
          })()}
        </>
      )}

      {tab === "top10" && <TopSource app={app} seed={seed} kw={query.kw ?? ""} followed={ctx.followed} lang={country.lang} countryName={country.name} aiEnabled={aiEnabled} merge={merge} />}
    </div>
  );
}

type SourceProps = {
  app: Awaited<ReturnType<typeof loadMarketParams>>;
  seed: string;
  lang: string;
  countryName: string;
  aiEnabled: boolean;
  merge: (lists: Candidate[][]) => Candidate[];
};

async function AutocompleteSource({ app, seed, lang, countryName, aiEnabled, merge }: SourceProps) {
  if (!seed) {
    return <EmptyState icon={Search} title="Escribe una semilla" description="Verás lo que la gente completa en el buscador de la tienda tras esa palabra." />;
  }
  const adapter = getAdapter(app.store);
  const prefixes = discoveryPrefixes(seed);
  const results = await Promise.allSettled(prefixes.map((p) => adapter.suggest(p, { country: app.country, lang })));
  const lists = results.flatMap((r, i) => (r.status === "fulfilled" ? [{ prefix: prefixes[i], suggestions: r.value }] : []));
  if (lists.length === 0) {
    const first = results.find((r) => r.status === "rejected");
    const reason = first && first.status === "rejected" ? String(first.reason?.message ?? first.reason) : "Sin respuesta";
    return <ErrorNote>No se pudo consultar el autocompletado: {reason}</ErrorNote>;
  }
  const candidates = merge([autocompleteCandidates(seed, lists)]);
  if (candidates.length === 0) {
    return <EmptyState icon={Search} title="Nada nuevo" description={`La tienda no sugiere nada que no sigas o hayas descartado para «${seed}» en ${countryName}.`} />;
  }
  return (
    <CandidateList appId={app.id} candidates={candidates} seed={seed} lang={lang} aiEnabled={aiEnabled} fileName={`keywords-autocompletado-${seed}-${app.store}-${app.country}`} label="Sugerencias del autocompletado" />
  );
}

async function TopSource({ app, seed, kw, followed, lang, countryName, aiEnabled, merge }: SourceProps & { kw: string; followed: string[] }) {
  // A typed seed wins; the old ?kw= of /top10 still works («all» searches the first followed keywords).
  const seeds = seed ? [seed] : kw === ALL ? followed.slice(0, MAX_SEED_KEYWORDS) : followed.includes(kw) ? [kw] : [];
  if (seeds.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="Escribe una búsqueda"
        description={`Leemos la ficha de las ${TOP_DEPTH} primeras apps y sacamos las palabras que comparten. Puedes elegir una keyword que sigues.`}
      />
    );
  }
  const result = await fetchTopApps(app, seeds);
  const terms = extractTopTerms(result.apps.map(toTopListing), { lang, exclude: seeds });
  const appCount = result.apps.length;
  const candidates = merge([
    terms.map((t) => ({
      term: t.term,
      source: "top10" as const,
      relevance: null,
      popularityEstimate: null,
      popularityMeasured: null,
      reason: `En ${t.apps} de ${appCount} apps del TOP${t.inTitle ? `, ${t.inTitle} en el título` : ""}`,
    })),
  ]);
  const label = seed || (kw === ALL ? `tus ${seeds.length} keywords` : kw);
  return (
    <>
      {result.errors.length > 0 && (
        <ErrorNote>
          {appCount === 0 ? "No se pudo consultar la tienda" : "Algunas consultas fallaron"}: {result.errors.slice(0, 3).join(" · ")}
        </ErrorNote>
      )}
      {appCount > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-label text-ink-soft">
          <span>
            {appCount} apps leídas para «{label}» en {countryName}:
          </span>
          <ol className="flex flex-wrap items-center gap-1" aria-label="Apps leídas">
            {result.apps.map((a) => (
              <li key={a.id} title={`#${a.position} ${a.title}`}>
                <a href={a.url} target="_blank" rel="noreferrer">
                  <AppIcon src={a.icon} size={24} alt={`#${a.position} ${a.title}`} />
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
      {appCount > 0 &&
        (candidates.length === 0 ? (
          <EmptyState icon={Trophy} title="Nada nuevo" description="Las fichas no comparten palabras que no sigas o hayas descartado. Prueba con otra búsqueda." />
        ) : (
          <CandidateList appId={app.id} candidates={candidates} lang={lang} aiEnabled={aiEnabled} fileName={`keywords-top10-${label}-${app.store}-${app.country}`} label="Keywords del TOP 10" />
        ))}
    </>
  );
}
