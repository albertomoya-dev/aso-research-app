import { Clock, Database, ImageIcon, KeyRound, type LucideIcon, Mail, ShoppingBag, Smartphone, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { IntegrationGuide } from "@/components/integration-guide";
import { IntegrationTest } from "@/components/integration-test";
import { Card, PageHeader } from "@/components/ui";
import { HelpTip } from "@/components/ui/help-tip";
import { type Status, StatusDot } from "@/components/ui/status-dot";
import { INTEGRATION_GUIDES } from "@/lib/integration-guides";
import { type Integration, type IntegrationId, type IntegrationState, integrationStatuses, README_URL } from "@/lib/settings";

export const metadata: Metadata = { title: "Integraciones" };
// Reads the environment on every request: a new variable in Vercel shows up after the next deploy.
export const dynamic = "force-dynamic";

const STATE: Record<IntegrationState, { status: Status; label: string }> = {
  on: { status: "good", label: "Conectada" },
  off: { status: "unknown", label: "Sin configurar" },
  invalid: { status: "bad", label: "Revisar" },
};

const ICON: Record<IntegrationId, LucideIcon> = {
  database: Database,
  password: KeyRound,
  cron: Clock,
  anthropic: Sparkles,
  images: ImageIcon,
  email: Mail,
  play: ShoppingBag,
  asc: Smartphone,
};

const TEST_LABEL: Partial<Record<IntegrationId, { label: string; pending: string }>> = {
  anthropic: { label: "Probar", pending: "Probando…" },
  play: { label: "Probar", pending: "Pidiendo token…" },
  asc: { label: "Probar", pending: "Probando…" },
  email: { label: "Probar", pending: "Enviando…" },
};

export default function IntegrationsPage() {
  const integrations = integrationStatuses();
  const ready = integrations.filter((i) => i.state === "on").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Integraciones">
        {ready} de {integrations.length} conectadas.{" "}
        <HelpTip label="Cómo se leen">
          El estado sale de las variables de entorno del servidor: aquí solo se ve si cada una está puesta, nunca su valor. Las pruebas son de solo
          lectura (Claude lista un modelo, Google Play pide un token, App Store Connect lista una app y el email manda uno de prueba). Las imágenes
          generativas no tienen prueba porque cada imagen se cobra.
        </HelpTip>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        {integrations.map((i) => (
          <IntegrationCard key={i.id} integration={i} />
        ))}
      </div>
    </div>
  );
}

function IntegrationCard({ integration: i }: { integration: Integration }) {
  const state = STATE[i.state];
  const test = i.testable ? TEST_LABEL[i.id] : undefined;
  const guide = INTEGRATION_GUIDES[i.id];
  const Icon = ICON[i.id];
  return (
    <Card aria-labelledby={`int-${i.id}`} className="flex min-w-0 flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-muted text-ink-soft">
          <Icon size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`int-${i.id}`} className="text-card-title font-semibold">
            {i.name}
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusDot status={state.status} label={state.label} />
            {i.write != null && <span className="text-table text-muted">{i.write ? "Escritura activada" : "Solo lectura"}</span>}
          </div>
        </div>
      </div>
      <p className="text-table text-ink-soft">{i.enables}</p>
      <p className={`text-table ${i.state === "invalid" ? "text-danger" : "text-muted"}`}>{i.detail}</p>
      <details className="text-table">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-ink-soft md:min-h-8">Detalles técnicos</summary>
        <ul aria-label="Variables de entorno" className="mt-1 flex flex-wrap gap-1.5">
          {i.vars.map((v) => (
            <li key={v.name} className="rounded-control border border-line px-2 py-0.5 font-mono text-label break-all">
              <span aria-hidden="true" className={v.set ? "text-ink" : "text-muted"}>
                {v.set ? "✓" : "–"}
              </span>{" "}
              <span className={v.set ? "text-ink-soft" : "text-muted"}>{v.name}</span>
              <span className="sr-only">{v.set ? ": puesta" : v.required ? ": falta" : ": opcional, sin poner"}</span>
              {!v.required && <span className="text-muted"> (opcional)</span>}
            </li>
          ))}
        </ul>
      </details>
      <div className="mt-auto flex flex-wrap items-start gap-3 pt-1">
        {test && <IntegrationTest id={i.id} label={test.label} pendingLabel={test.pending} />}
        {i.state !== "on" && <IntegrationGuide name={i.name} steps={guide.steps} vars={guide.vars} readmeHref={README_URL + i.readme.anchor} />}
      </div>
    </Card>
  );
}
