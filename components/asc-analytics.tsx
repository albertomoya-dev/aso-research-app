import { requestAscAnalytics } from "@/app/asc-actions";
import { ascConfig } from "@/lib/app-store-connect/auth";
import { ascErrorMessage, getAscClient } from "@/lib/app-store-connect/client";
import { PublishForm } from "./publish-form";
import { Card, ErrorNote } from "./ui";

const CATEGORY_LABEL: Record<string, string> = {
  APP_STORE_ENGAGEMENT: "Interacción en el App Store",
  APP_STORE_COMMERCE: "Comercio en el App Store",
  COMMERCE: "Comercio",
  APP_USAGE: "Uso de la app",
  FRAMEWORK_USAGE: "Uso de frameworks",
  PERFORMANCE: "Rendimiento",
};

/**
 * Read-only view of the Analytics Reports API: which report requests exist for the app and which reports
 * Apple generated. Downloading and importing the report files is not done yet (see README).
 */
export async function AscAnalytics({ appId, storeId, bundleId }: { appId: number; storeId: string; bundleId: string | null }) {
  const client = getAscClient();
  if (!client) return null;
  let data: Awaited<ReturnType<typeof client.listAnalyticsReportRequests>> | null = null;
  let error: string | null = null;
  try {
    data = await client.listAnalyticsReportRequests(await client.findApp(storeId, bundleId));
  } catch (err) {
    error = ascErrorMessage(err);
  }
  const ongoing = data?.requests.find((r) => r.accessType === "ONGOING" && !r.stopped);
  const byCategory = Map.groupBy(data?.reports ?? [], (r) => r.category);

  return (
    <Card aria-label="Informes de analítica de App Store Connect" className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-[15px] font-semibold">Informes de analítica</h2>
        <span className="rounded-md border border-line-strong px-2 py-0.5 text-xs font-semibold text-ink-soft">Dato oficial · App Store Connect</span>
      </div>
      <p className="text-[13px] text-muted">
        Apple genera informes diarios de impresiones, visitas a la ficha, descargas y uso si se los pides una vez (Analytics Reports API). Aquí ves
        qué informes hay; Rankeo aún no los descarga ni los cruza con tus keywords. La clave necesita el rol Admin para pedirlos.
      </p>
      {error ? (
        <ErrorNote>No se pudieron leer los informes. {error}</ErrorNote>
      ) : ongoing ? (
        byCategory.size === 0 ? (
          <p className="text-sm text-ink-soft">Informes pedidos. Apple tarda 1 o 2 días en generar los primeros.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {[...byCategory.entries()].map(([category, reports]) => (
              <li key={category}>
                <span className="font-medium">{CATEGORY_LABEL[category] ?? category}</span>
                <span className="text-muted"> · {reports.map((r) => r.name).join(", ")}</span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <p className="text-sm text-ink-soft">
            {data?.requests.some((r) => r.stopped)
              ? "Apple dejó de generar los informes por falta de uso: hay que pedirlos de nuevo."
              : "Aún no has pedido los informes de esta app."}
          </p>
          {ascConfig().writeEnabled ? (
            <PublishForm
              action={requestAscAnalytics}
              fields={{ appId: String(appId) }}
              label="Pedir informes a Apple"
              pendingLabel="Pidiendo…"
              confirmMessage="¿Pedir a Apple que genere los informes de analítica de esta app (acceso continuo)?"
              secondary
            />
          ) : (
            <p className="text-[13px] text-muted">Modo solo lectura: con ASC_ALLOW_WRITE=1 podrás pedirlos desde aquí, o pídelos con la API desde otra herramienta.</p>
          )}
        </>
      )}
    </Card>
  );
}
