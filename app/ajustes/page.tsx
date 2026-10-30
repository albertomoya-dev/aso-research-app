import type { Metadata } from "next";
import { IntegrationTest } from "@/components/integration-test";
import { Card, PageHeader } from "@/components/ui";
import { type Integration, type IntegrationState, integrationStatuses, README_URL } from "@/lib/settings";

export const metadata: Metadata = { title: "Ajustes" };
// Reads the environment on every request: a new variable in Vercel shows up after the next deploy.
export const dynamic = "force-dynamic";

const STATE: Record<IntegrationState, { label: string; className: string }> = {
  on: { label: "Configurada", className: "border-line-strong bg-surface-muted text-ink" },
  off: { label: "Sin configurar", className: "border-line text-muted" },
  invalid: { label: "Revisar", className: "border-transparent bg-danger-soft text-danger" },
};

const TEST_LABEL: Partial<Record<Integration["id"], { label: string; pending: string }>> = {
  anthropic: { label: "Probar conexión", pending: "Probando…" },
  play: { label: "Probar conexión", pending: "Pidiendo token…" },
  asc: { label: "Probar conexión", pending: "Probando…" },
  email: { label: "Enviar email de prueba", pending: "Enviando…" },
};

export default function SettingsPage() {
  const integrations = integrationStatuses();
  const ready = integrations.filter((i) => i.state === "on").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Ajustes">
        Estado de cada integración, leído de las variables de entorno del servidor. Aquí solo se ve si cada variable está puesta, nunca su
        valor. Para cambiarlas, edítalas en Vercel (Settings › Environment Variables) o en <code className="font-mono">.env.local</code> y vuelve a
        desplegar. {ready} de {integrations.length} configuradas.
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        {integrations.map((i) => (
          <IntegrationCard key={i.id} integration={i} />
        ))}
      </div>

      <p className="text-[13px] text-muted">
        Las pruebas son de solo lectura: Claude lista un modelo (no genera nada ni cobra), Google Play solo pide un token de acceso y App Store
        Connect lista como mucho una app. Las imágenes generativas no tienen prueba porque cada imagen cuesta dinero.
      </p>
    </div>
  );
}

function IntegrationCard({ integration: i }: { integration: Integration }) {
  const state = STATE[i.state];
  const test = i.testable ? TEST_LABEL[i.id] : undefined;
  return (
    <Card aria-labelledby={`int-${i.id}`} className="flex min-w-0 flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`int-${i.id}`} className="text-[15px] font-semibold">
          {i.name}
        </h2>
        <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${state.className}`}>{state.label}</span>
        {i.write != null && (
          <span className="rounded-md border border-line px-2 py-0.5 text-xs font-medium text-ink-soft">
            {i.write ? "Escritura activada" : "Solo lectura"}
          </span>
        )}
      </div>
      <p className="text-[13px] text-ink-soft">{i.enables}</p>
      <p className={`text-[13px] ${i.state === "invalid" ? "text-danger" : "text-muted"}`}>{i.detail}</p>
      <ul aria-label="Variables de entorno" className="flex flex-wrap gap-1.5">
        {i.vars.map((v) => (
          <li key={v.name} className="rounded-md border border-line px-2 py-0.5 font-mono text-xs break-all">
            <span aria-hidden="true" className={v.set ? "text-ink" : "text-muted"}>
              {v.set ? "✓" : "–"}
            </span>{" "}
            <span className={v.set ? "text-ink-soft" : "text-muted"}>{v.name}</span>
            <span className="sr-only">{v.set ? ": puesta" : v.required ? ": falta" : ": opcional, sin poner"}</span>
            {!v.required && <span className="text-muted"> (opcional)</span>}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-wrap items-start justify-between gap-3 pt-1">
        {test ? <IntegrationTest id={i.id} label={test.label} pendingLabel={test.pending} /> : <span />}
        <a
          href={README_URL + i.readme.anchor}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center text-[13px] text-link hover:underline md:min-h-8"
        >
          Cómo configurarla: README, «{i.readme.section}»
        </a>
      </div>
    </Card>
  );
}
