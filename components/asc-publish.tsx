import Link from "next/link";
import { publishToAsc } from "@/app/asc-actions";
import type { App } from "@/db/schema";
import { ascErrorMessage, type AscListing, getAscClient } from "@/lib/app-store-connect/client";
import { planAscPublish } from "@/lib/app-store-connect/plan";
import { formatDate } from "@/lib/format";
import { type DraftTarget, targetLabel } from "@/lib/listing-drafts";
import { ascNextFields, buildPublishPreview, fieldList, PUBLISH_FIELDS } from "@/lib/publications";
import { PublishDiff } from "./publish-diff";
import { PublishForm } from "./publish-form";
import { Card, ErrorNote, inputClass } from "./ui";

function SetupAsc({ error }: { error: string | null }) {
  return (
    <Card aria-label="Conectar App Store Connect" className="flex flex-col gap-2 px-5 py-4 text-sm text-ink-soft">
      <h2 className="text-[15px] font-semibold text-ink">Conecta App Store Connect</h2>
      {error && <ErrorNote>{error}</ErrorNote>}
      <ol className="flex list-decimal flex-col gap-1 pl-5">
        <li>En App Store Connect › Usuarios y acceso › Integraciones, crea una clave de API de equipo con el rol App Manager y descarga el archivo .p8.</li>
        <li>
          Añade en las variables de entorno del servidor <code className="font-mono">ASC_ISSUER_ID</code>, <code className="font-mono">ASC_KEY_ID</code> y{" "}
          <code className="font-mono">ASC_PRIVATE_KEY</code> (el contenido del .p8; vale con los saltos de línea escritos como \n).
        </li>
        <li>
          Para poder enviar textos, añade también <code className="font-mono">ASC_ALLOW_WRITE=1</code>; sin ella la conexión es de solo lectura.
        </li>
      </ol>
      <p className="text-[13px] text-muted">Los pasos detallados están en el README, sección «App Store Connect».</p>
    </Card>
  );
}

const extraSpec = (key: "promotionalText" | "whatsNew") => PUBLISH_FIELDS.ios.find((f) => f.key === key)!;

/** Preview and confirmed save of a draft in the App Store version in preparation. */
export async function AscPublish({ app, target, editorHref }: { app: App; target: DraftTarget; editorHref: string }) {
  const plan = await planAscPublish(app, target);
  if (plan.kind === "unconfigured") return <SetupAsc error={plan.error} />;
  if (plan.kind === "wrong-store") return null;
  if (plan.kind === "no-locale") {
    return (
      <Card className="px-5 py-4 text-sm text-ink-soft">
        App Store Connect no tiene una localización para {targetLabel(target)}: los usuarios de ese país ven otra.{" "}
        {plan.alternatives.length > 0 && `Localizaciones del mismo idioma: ${plan.alternatives.join(", ")}. `}
        Abre el borrador de una de ellas en el editor para enviarlo.
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

  let listing: AscListing | null = null;
  let error: string | null = null;
  try {
    listing = await getAscClient()!.readListing(app.storeId, app.meta.bundleId, plan.locale.code);
  } catch (err) {
    error = ascErrorMessage(err);
  }
  if (!listing) {
    return (
      <Card className="px-5 py-4">
        <ErrorNote>No se pudo leer la ficha de App Store Connect. {error}</ErrorNote>
      </Card>
    );
  }

  const live = listing.fields;
  // Same function as the action; the extras start with the console's current text, so untouched means unchanged.
  const { fields, kept } = ascNextFields(plan.draft.draft, live, {}, listing.appInfoLocalizationId != null);
  const preview = buildPublishPreview("ios", live, fields);
  const labels = preview.changes.map((c) => c.label);

  return (
    <Card aria-label="Vista previa" className="flex flex-col gap-5 px-5 py-5">
      <div>
        <h2 className="text-[15px] font-semibold">
          Qué cambia en la versión {listing.version.versionString} <span className="font-mono text-[13px] text-muted">{plan.locale.code}</span>
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Leído ahora mismo de App Store Connect (versión en estado {listing.version.state}). Se guarda en esa versión; enviarla a revisión se hace
          después en App Store Connect. {plan.locale.note}
        </p>
      </div>
      <PublishDiff changes={preview.changes} unchanged={preview.unchanged} liveLabel="Ahora en App Store Connect" />
      {kept.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px] text-muted">
          {kept.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      )}
      {preview.blockers.length > 0 && <ErrorNote>No se puede enviar: {preview.blockers.join(" ")}</ErrorNote>}
      {preview.blockers.length === 0 && plan.writeEnabled && (
        <PublishForm
          action={publishToAsc}
          fields={{ appId: String(app.id), locale: target.locale, draftUpdatedAt: plan.draft.updatedAt.toISOString() }}
          label="Enviar a App Store Connect"
          pendingLabel="Guardando en App Store Connect…"
          confirmMessage={`¿Guardar en App Store Connect (${plan.locale.code}, versión ${listing.version.versionString}) ${
            labels.length ? fieldList(labels) : "los textos"
          }${labels.length ? " y" : ""} el texto promocional y las novedades si los has cambiado?`}
        >
          {(["promotionalText", "whatsNew"] as const).map((key) => (
            <label key={key} className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              {extraSpec(key).label} <span className="font-normal text-muted">(máx. {extraSpec(key).limit}; si lo dejas igual o vacío, no cambia)</span>
              <textarea name={key} defaultValue={live[key] ?? ""} rows={key === "whatsNew" ? 5 : 3} maxLength={extraSpec(key).limit} className={`${inputClass} py-2`} />
            </label>
          ))}
        </PublishForm>
      )}
      {!plan.writeEnabled && (
        <p role="note" className="rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">
          Modo solo lectura. Para enviar desde Rankeo añade <code className="font-mono">ASC_ALLOW_WRITE=1</code> en las variables de entorno del
          servidor; mientras, copia estos textos en App Store Connect.
        </p>
      )}
      <p className="text-xs text-muted">Se envía el borrador guardado el {formatDate(plan.draft.updatedAt)}.</p>
    </Card>
  );
}
