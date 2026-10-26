import type { Metadata } from "next";
import Link from "next/link";
import { followApp } from "@/app/actions";
import { AppIcon } from "@/components/app-icon";
import { AppMetadata } from "@/components/app-metadata";
import { CountrySelect } from "@/components/country-select";
import { StoreBadge } from "@/components/store-badge";
import { buttonPrimary, Card, ErrorNote, inputClass, PageHeader } from "@/components/ui";
import { DEFAULT_COUNTRY, getCountry, isCountry } from "@/lib/countries";
import { formatRating } from "@/lib/format";
import { getAdapter, looksLikeAppId, STORE_LABEL, STORES, type AppMeta, type AppSummary, type Store } from "@/lib/stores";

export const metadata: Metadata = { title: "Buscar app" };

type SearchParams = { q?: string; store?: string; country?: string; sel?: string };
type StoreResult = { store: Store; apps: AppSummary[]; error?: string };

const RESULTS_PER_STORE = 10;

async function searchStore(store: Store, q: string, country: string): Promise<StoreResult> {
  const adapter = getAdapter(store);
  const query = { country, lang: getCountry(country).lang };
  try {
    if (looksLikeAppId(store, q)) return { store, apps: [await adapter.getApp(q, query)] };
    const apps = await adapter.searchApps(q, { ...query, limit: RESULTS_PER_STORE });
    return { store, apps };
  } catch (error) {
    return { store, apps: [], error: error instanceof Error ? error.message : "Error desconocido" };
  }
}

async function loadSelected(sel: string | undefined, country: string): Promise<{ meta?: AppMeta; error?: string }> {
  const [store, ...rest] = sel?.split(":") ?? [];
  const id = rest.join(":");
  if ((store !== "ios" && store !== "android") || !id) return {};
  try {
    return { meta: await getAdapter(store).getApp(id, { country, lang: getCountry(country).lang }) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo cargar la ficha" };
  }
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const store: Store | "both" = params.store === "ios" || params.store === "android" ? params.store : "both";
  const country = params.country && isCountry(params.country) ? params.country.toLowerCase() : DEFAULT_COUNTRY;
  const stores = store === "both" ? STORES : [store];

  const [results, selected] = await Promise.all([
    q ? Promise.all(stores.map((s) => searchStore(s, q, country))) : Promise.resolve([]),
    loadSelected(params.sel, country),
  ]);
  const apps = results.flatMap((r) => r.apps);
  const allFailed = results.length > 0 && results.every((r) => r.error);
  const selectHref = (app: AppSummary) =>
    `/buscar?${new URLSearchParams({ q, store, country, sel: `${app.store}:${app.id}` })}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Buscar una app">
        Escribe el nombre, el ID de App Store o el paquete de Google Play. Traemos su ficha tal como está publicada en la tienda.
      </PageHeader>

      <Card className="px-5 py-4">
        <form className="flex flex-wrap items-end gap-2.5" action="/buscar">
          <label className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
            App
            <input type="search" name="q" defaultValue={q} required placeholder="Nombre, ID o paquete" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
            Tienda
            <select name="store" defaultValue={store} className={inputClass}>
              <option value="both">Ambas</option>
              {STORES.map((s) => (
                <option key={s} value={s}>
                  {STORE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <CountrySelect defaultValue={country} />
          <button type="submit" className={buttonPrimary}>
            Buscar
          </button>
        </form>
      </Card>

      {results.map((r) =>
        r.error ? (
          <ErrorNote key={r.store}>
            {STORE_LABEL[r.store]} no respondió: {r.error}
          </ErrorNote>
        ) : null,
      )}

      {((q && !allFailed) || selected.meta || selected.error) && (
        <div className="flex flex-wrap items-start gap-6">
          {q && !allFailed && (
            <Card aria-label="Resultados" className="min-w-0 flex-[1_1_340px] overflow-hidden">
              <div className="border-b border-line px-5 py-3.5 text-[13px] text-muted">
                {apps.length === 1 ? "1 resultado" : `${apps.length} resultados`}
              </div>
              {apps.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted">No hay resultados para «{q}» en este país.</p>
              ) : (
                <ul>
                  {apps.map((app) => {
                    const active = params.sel === `${app.store}:${app.id}`;
                    return (
                      <li key={`${app.store}:${app.id}`} className="border-t border-line first:border-t-0">
                        <Link
                          href={selectHref(app)}
                          aria-current={active ? "true" : undefined}
                          className={`flex items-center gap-3.5 px-5 py-3.5 hover:bg-surface-muted ${
                            active ? "bg-brand-soft shadow-[inset_3px_0_0_var(--brand)]" : ""
                          }`}
                        >
                          <AppIcon src={app.icon} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[15px] font-semibold">{app.title}</div>
                            <div className="truncate text-[13px] text-muted">{app.developer}</div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <StoreBadge store={app.store} />
                              <span className="text-xs text-muted">{formatRating(app.rating)}</span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          <Card aria-label="Ficha de la app" className="min-w-0 flex-[2_1_560px] p-6">
            {selected.error && <ErrorNote>{selected.error}</ErrorNote>}
            {selected.meta ? (
              <AppDetail meta={selected.meta} />
            ) : (
              !selected.error && <p className="py-8 text-center text-sm text-muted">Elige una app de la lista para ver su ficha.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function AppDetail({ meta }: { meta: AppMeta }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <AppIcon src={meta.icon} size={84} />
          <div>
            <StoreBadge store={meta.store} country={meta.country} />
            <h2 className="mt-1.5 text-[22px] font-bold">{meta.title}</h2>
            <div className="text-sm text-muted">
              {meta.developer}
              {meta.category && ` · ${meta.category}`}
            </div>
            <a href={meta.url} target="_blank" rel="noreferrer" className="text-sm text-brand underline">
              Ver en la tienda
            </a>
          </div>
        </div>
        <form action={followApp}>
          <input type="hidden" name="store" value={meta.store} />
          <input type="hidden" name="id" value={meta.id} />
          <input type="hidden" name="country" value={meta.country} />
          <button type="submit" className={buttonPrimary}>
            Seguir esta app
          </button>
        </form>
      </div>
      <AppMetadata meta={meta} />
    </div>
  );
}
