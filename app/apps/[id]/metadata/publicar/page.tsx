import type { Metadata } from "next";
import Link from "next/link";
import { publishToPlay } from "@/app/play-actions";
import { PublicationHistory } from "@/components/publication-history";
import { PublishDiff } from "@/components/publish-diff";
import { PublishForm } from "@/components/publish-form";
import { buttonSecondary, Card, ErrorNote, PageHeader } from "@/components/ui";
import type { App } from "@/db/schema";
import { loadApp } from "@/lib/apps";
import { formatDate } from "@/lib/format";
import { type DraftTarget, resolveTarget, targetLabel, targetQuery } from "@/lib/listing-drafts";
import { getPlayClient, playErrorMessage } from "@/lib/play-console/client";
import { planPlayPublish } from "@/lib/play-console/plan";
import { getPublications } from "@/lib/publication-queries";
import { buildPublishPreview, fieldList } from "@/lib/publications";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const metadata: Metadata = { title: "Publicar la ficha" };
// Opening an edit, reading the listing and deleting the edit are three calls to Google.
export const maxDuration = 60;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);

export default async function PublishPage({ params, searchParams }: Props) {
  const app = await loadApp((await params).id);
  const query = await searchParams;
  const target = resolveTarget(app.country, app.store, { locale: one(query.locale), country: one(query.country) });
  const editorHref = `/apps/${app.id}/metadata${targetQuery(app.country, target)}`;
  const storeName = app.store === "android" ? "Google Play" : "App Store Connect";

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        /{" "}
        <Link href={editorHref} className="text-link hover:underline">
          Editor de ficha
        </Link>{" "}
        / Publicar
      </nav>
      <PageHeader title={`Publicar en ${storeName}`}>
        Envía el borrador guardado de {targetLabel(target)} a {storeName}. Antes de nada verás, campo a campo, lo que hay ahora en la consola y lo
        que se enviará; no se cambia nada hasta que lo confirmes.
      </PageHeader>
      {app.store === "android" ? (
        <PlayPublish app={app} target={target} editorHref={editorHref} />
      ) : (
        <Card className="px-5 py-4 text-sm text-ink-soft">El envío a App Store Connect llega en la siguiente fase. Mientras, copia el borrador en la consola.</Card>
      )}
      <div>
        <Link href={editorHref} className={buttonSecondary}>
          Volver al editor
        </Link>
      </div>
      <PublicationHistory rows={await getPublications(app.id)} />
    </div>
  );
}

function SetupPlay({ error }: { error: string | null }) {
  return (
    <Card aria-label="Conectar Google Play Console" className="flex flex-col gap-2 px-5 py-4 text-sm text-ink-soft">
      <h2 className="text-[15px] font-semibold text-ink">Conecta Google Play Console</h2>
      {error && <ErrorNote>{error}</ErrorNote>}
      <ol className="flex list-decimal flex-col gap-1 pl-5">
        <li>En Google Cloud, activa la «Google Play Android Developer API» y crea una cuenta de servicio con una clave JSON.</li>
        <li>En Play Console › Usuarios y permisos, invita el correo de la cuenta de servicio con acceso a esta app (editar la ficha y responder reseñas).</li>
        <li>
          Pega el JSON (tal cual o en base64) en la variable de entorno del servidor <code className="font-mono">GOOGLE_PLAY_SERVICE_ACCOUNT_JSON</code>.
          Para poder publicar, añade también <code className="font-mono">GOOGLE_PLAY_ALLOW_WRITE=1</code>; sin ella la conexión es de solo lectura.
        </li>
      </ol>
      <p className="text-[13px] text-muted">Los pasos detallados están en el README, sección «Google Play Console».</p>
    </Card>
  );
}

async function PlayPublish({ app, target, editorHref }: { app: App; target: DraftTarget; editorHref: string }) {
  const plan = await planPlayPublish(app, target);
  if (plan.kind === "unconfigured") return <SetupPlay error={plan.error} />;
  if (plan.kind === "wrong-store") return null;
  if (plan.kind === "custom-listing") {
    return (
      <Card className="px-5 py-4 text-sm text-ink-soft">
        La API de Google Play no permite editar las fichas personalizadas por país. Copia este borrador en Play Console › Fichas de Play Store
        personalizadas.
      </Card>
    );
  }
  if (plan.kind === "no-language") {
    return (
      <Card className="px-5 py-4 text-sm text-ink-soft">
        Google Play no tiene una ficha para {targetLabel(target)}.{" "}
        {plan.alternatives.length > 0 && `Idiomas parecidos que sí admite: ${plan.alternatives.join(", ")}. `}
        Abre el borrador de uno de esos idiomas en el editor para publicarlo.
      </Card>
    );
  }
  if (plan.kind === "no-draft") {
    return (
      <Card className="px-5 py-4 text-sm text-ink-soft">
        No hay ningún borrador guardado de {targetLabel(target)}.{" "}
        <Link href={editorHref} className="text-link hover:underline">
          Guárdalo en el editor
        </Link>{" "}
        y vuelve aquí.
      </Card>
    );
  }

  const client = getPlayClient();
  let live = null;
  let liveError: string | null = null;
  try {
    live = await client!.readListing(app.storeId, plan.language.code);
  } catch (err) {
    liveError = playErrorMessage(err);
  }
  const preview = buildPublishPreview("android", live, plan.fields);
  const labels = preview.changes.map((c) => c.label);

  return (
    <Card aria-label="Vista previa" className="flex flex-col gap-5 px-5 py-5">
      <div>
        <h2 className="text-[15px] font-semibold">
          Qué cambia en la ficha <span className="font-mono text-[13px] text-muted">{plan.language.code}</span>
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          {live ? "Ficha leída ahora mismo de Google Play Console." : liveError ? "" : "Esta app aún no tiene ficha en este idioma: se creará."}{" "}
          {plan.language.note}
        </p>
      </div>
      {liveError ? (
        <ErrorNote>No se pudo leer la ficha actual de Google Play. {liveError}</ErrorNote>
      ) : (
        <>
          <PublishDiff changes={preview.changes} unchanged={preview.unchanged} liveLabel="Ahora en Google Play" />
          {preview.blockers.length > 0 && <ErrorNote>No se puede publicar: {preview.blockers.join(" ")}</ErrorNote>}
          {preview.changes.length > 0 && preview.blockers.length === 0 && plan.writeEnabled && (
            <PublishForm
              action={publishToPlay}
              fields={{ appId: String(app.id), locale: target.locale, country: "", draftUpdatedAt: plan.draft.updatedAt.toISOString() }}
              label="Publicar en Google Play"
              pendingLabel="Enviando a Google Play…"
              confirmMessage={`¿Publicar en Google Play (${plan.language.code}) ${fieldList(labels)}? Google revisará el cambio antes de mostrarlo en la tienda.`}
            />
          )}
          {preview.changes.length > 0 && !plan.writeEnabled && (
            <p role="note" className="rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">
              Modo solo lectura. Para publicar desde Rankeo añade <code className="font-mono">GOOGLE_PLAY_ALLOW_WRITE=1</code> en las variables de
              entorno del servidor; mientras, copia estos textos en Play Console.
            </p>
          )}
          <p className="text-xs text-muted">
            Se envía el borrador guardado el {formatDate(plan.draft.updatedAt)}. Si hay
            cambios de la ficha en revisión en Google, la publicación se rechaza en lugar de cancelarlos.
          </p>
        </>
      )}
    </Card>
  );
}
