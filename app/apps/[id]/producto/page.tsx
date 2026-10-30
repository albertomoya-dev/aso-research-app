import type { Metadata } from "next";
import Link from "next/link";
import { addFeature, addRelease, deleteFeature, deleteRelease, updateFeature, updateRelease } from "@/app/product-actions";
import { ChangelogImport } from "@/components/changelog-import";
import { ConfirmButton } from "@/components/confirm-button";
import { ProductFactsForm } from "@/components/product-facts-form";
import { SubmitButton } from "@/components/submit-button";
import { buttonSecondary, Card, inputClass, PageHeader } from "@/components/ui";
import { loadApp } from "@/lib/apps";
import { hasAnthropicKey } from "@/lib/claude";
import {
  EMPTY_FACTS,
  FEATURE_STATUS_LABEL,
  FEATURE_STATUSES,
  type FeatureStatus,
  factsForPrompt,
  hasProductFacts,
} from "@/lib/product-facts";
import { type FeatureRow, getProductFacts, type ReleaseRow } from "@/lib/product-queries";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Ficha de producto" };
// Reading a CHANGELOG with Claude can take a minute.
export const maxDuration = 120;

const STATUS_HINT: Record<FeatureStatus, string> = {
  shipped: "ya está en la versión de la tienda",
  next_release: "llega en la próxima versión",
  planned: "en el plan; la IA nunca la anuncia",
  retired: "se quitó; la IA nunca la anuncia",
};

export default async function ProductPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const { facts, features, releases } = await getProductFacts(app.id);
  const counts = FEATURE_STATUSES.map((s) => ({ status: s, count: features.filter((f) => f.status === s).length })).filter((c) => c.count > 0);
  const preview = factsForPrompt(facts, features, "next");

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Ficha de producto
      </nav>
      <PageHeader title="Ficha de producto">
        Lo que hace tu app, contado por ti. La ficha publicada en la tienda siempre va por detrás del producto, así que la IA (optimizador de
        ficha, ideas de keywords, textos de creativos y análisis de reseñas) usa esta ficha como fuente de verdad: solo anuncia las funciones
        publicadas, y las de la próxima versión cuando preparas la ficha para ella. Las planeadas y las retiradas no se anuncian nunca: la IA solo recibe sus nombres para no mencionarlas.
      </PageHeader>

      {!hasProductFacts(facts, features) && (
        <p className="rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn-fg">
          Tu ficha de producto está vacía: hoy la IA solo conoce la ficha publicada
          {app.meta.version ? ` (versión ${app.meta.version})` : ""}. Rellena al menos las funciones, o impórtalas desde tu CHANGELOG.
        </p>
      )}

      <Card aria-label="Resumen del producto" className="px-5 py-5">
        <h2 className="text-[15px] font-semibold">Resumen del producto</h2>
        <p className="mt-1 mb-4 text-[13px] text-muted">Todo es opcional. Cuanto más concreto, menos tiene que suponer la IA.</p>
        <ProductFactsForm appId={app.id} facts={facts ?? EMPTY_FACTS} />
      </Card>

      <Card aria-label="Funciones" className="overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">Funciones</h2>
          <p className="mt-1 text-[13px] text-muted">
            {features.length === 0
              ? "Aún no hay funciones. Añádelas una a una o impórtalas desde el CHANGELOG."
              : `${counts.map((c) => `${FEATURE_STATUS_LABEL[c.status]}: ${c.count}`).join(" · ")}. Desmarca «Anunciar» en las funciones internas que no deben salir en la ficha.`}
          </p>
        </div>
        <ul>
          {features.map((f) => (
            <li key={f.id} className="border-b border-line px-5 py-3">
              <FeatureForm appId={app.id} feature={f} />
            </li>
          ))}
          <li className="px-5 py-4">
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Añadir función</h3>
            <FeatureForm appId={app.id} />
          </li>
        </ul>
      </Card>

      <Card aria-label="Importar desde CHANGELOG" className="px-5 py-5">
        <h2 className="text-[15px] font-semibold">Importar desde CHANGELOG</h2>
        <p className="mt-1 mb-4 text-[13px] text-muted">
          Claude lee el texto y propone las funciones con su estado
          {app.meta.version ? `, tomando la ${app.meta.version} como versión publicada` : ""}. Tú decides qué se guarda.
        </p>
        {hasAnthropicKey() ? (
          <ChangelogImport appId={app.id} />
        ) : (
          <div className="text-sm">
            <h3 className="font-semibold">Falta la clave de Anthropic</h3>
            <p className="mt-1.5 text-ink-soft">
              Añade <code className="font-mono">ANTHROPIC_API_KEY</code> en las variables de entorno (en Vercel: Settings → Environment
              Variables) y vuelve a desplegar; en <Link href="/ajustes" className="text-link hover:underline">Ajustes</Link> puedes comprobar si la clave funciona. Mientras tanto puedes añadir las funciones a mano.
            </p>
          </div>
        )}
      </Card>

      <Card aria-label="Versiones" className="overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">Versiones</h2>
          <p className="mt-1 text-[13px] text-muted">
            Historial de lo que cambió en cada versión. Servirá para las notas de versión y para anotar los cambios en los gráficos.
          </p>
        </div>
        <ul>
          {releases.map((r) => (
            <li key={r.id} className="border-b border-line px-5 py-3">
              <ReleaseForm appId={app.id} release={r} />
            </li>
          ))}
          <li className="px-5 py-4">
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Añadir versión</h3>
            <ReleaseForm appId={app.id} />
          </li>
        </ul>
      </Card>

      {preview && (
        <Card aria-label="Lo que lee la IA" className="px-5 py-4">
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-ink-soft">Ver lo que lee la IA (ficha para la próxima versión)</summary>
            <p className="mt-2 text-[13px] text-muted">
              Este bloque va en cada petición, en inglés porque así sigue mejor las instrucciones; los textos que escribe salen en el idioma de
              la tienda.
            </p>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2.5 font-mono text-xs text-ink-soft">
              {preview}
            </pre>
          </details>
        </Card>
      )}
    </div>
  );
}

function FeatureForm({ appId, feature }: { appId: number; feature?: FeatureRow }) {
  const id = feature ? `feature-${feature.id}` : "feature-new";
  return (
    <form action={feature ? updateFeature : addFeature} className="grid gap-2 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_10rem_6rem_auto_auto]">
      <input type="hidden" name="appId" value={appId} />
      {feature && <input type="hidden" name="featureId" value={feature.id} />}
      <label className="sr-only" htmlFor={`${id}-name`}>
        Nombre
      </label>
      <input
        id={`${id}-name`}
        name="name"
        required
        maxLength={120}
        defaultValue={feature?.name}
        placeholder="Nombre, p. ej. «Escanear el código de barras»"
        className={`${inputClass} ${feature?.status === "retired" ? "text-muted line-through" : ""}`}
      />
      <label className="sr-only" htmlFor={`${id}-summary`}>
        Qué permite hacer
      </label>
      <input id={`${id}-summary`} name="summary" maxLength={300} defaultValue={feature?.summary} placeholder="Qué permite hacer, en una frase" className={inputClass} />
      <label className="sr-only" htmlFor={`${id}-status`}>
        Estado
      </label>
      <select id={`${id}-status`} name="status" defaultValue={feature?.status ?? "shipped"} title={feature ? STATUS_HINT[feature.status] : undefined} className={inputClass}>
        {FEATURE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {FEATURE_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`${id}-since`}>
        Desde la versión
      </label>
      <input id={`${id}-since`} name="sinceVersion" maxLength={30} defaultValue={feature?.sinceVersion ?? ""} placeholder="Versión" className={`${inputClass} font-mono`} />
      <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink-soft md:min-h-9">
        <input type="checkbox" name="advertise" defaultChecked={feature?.advertise ?? true} className="size-5 accent-[var(--brand)]" />
        Anunciar
      </label>
      <span className="flex gap-2">
        <SubmitButton pendingLabel="Guardando…" className={buttonSecondary}>
          {feature ? "Guardar" : "Añadir"}
        </SubmitButton>
        {feature && (
          <ConfirmButton formAction={deleteFeature} formNoValidate message={`¿Quitar «${feature.name}» de la ficha de producto?`} className={`${buttonSecondary} text-danger`}>
            Quitar
          </ConfirmButton>
        )}
      </span>
    </form>
  );
}

function ReleaseForm({ appId, release }: { appId: number; release?: ReleaseRow }) {
  const id = release ? `release-${release.id}` : "release-new";
  return (
    <form action={release ? updateRelease : addRelease} className="grid gap-2 md:grid-cols-[7rem_10rem_minmax(0,1fr)_auto]">
      <input type="hidden" name="appId" value={appId} />
      {release && <input type="hidden" name="releaseId" value={release.id} />}
      <label className="sr-only" htmlFor={`${id}-version`}>
        Versión
      </label>
      <input id={`${id}-version`} name="version" required maxLength={30} defaultValue={release?.version} placeholder="3.0.0" className={`${inputClass} font-mono`} />
      <label className="sr-only" htmlFor={`${id}-date`}>
        Fecha
      </label>
      <input id={`${id}-date`} name="date" type="date" defaultValue={release?.date ?? ""} className={inputClass} />
      <label className="sr-only" htmlFor={`${id}-notes`}>
        Qué cambió
      </label>
      <textarea id={`${id}-notes`} name="notes" rows={1} maxLength={4000} defaultValue={release?.notes} placeholder="Qué cambió para los usuarios" className={`${inputClass} py-2`} />
      <span className="flex gap-2">
        <SubmitButton pendingLabel="Guardando…" className={buttonSecondary}>
          {release ? "Guardar" : "Añadir"}
        </SubmitButton>
        {release && (
          <ConfirmButton formAction={deleteRelease} formNoValidate message={`¿Quitar la versión ${release.version} del historial?`} className={`${buttonSecondary} text-danger`}>
            Quitar
          </ConfirmButton>
        )}
      </span>
    </form>
  );
}
