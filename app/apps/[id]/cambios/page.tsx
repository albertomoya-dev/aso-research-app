import type { Metadata } from "next";
import Link from "next/link";
import { removeAnnotation } from "@/app/actions";
import { AnnotationBadge } from "@/components/annotation-badge";
import { AnnotationForm } from "@/components/annotation-form";
import { ConfirmButton } from "@/components/confirm-button";
import { ExperimentForm } from "@/components/experiment-form";
import { PositionChange } from "@/components/rank";
import { Card, PageHeader } from "@/components/ui";
import { type AnnotationWithImpact, CHANGES_DAYS, getAnnotationsWithImpact, getExperiments } from "@/lib/annotation-queries";
import type { AnnotationChange } from "@/lib/annotations";
import { loadApp } from "@/lib/apps";
import { EXPERIMENT_STATUS_LABEL, MIN_EXPERIMENT_DAYS } from "@/lib/experiments";
import { formatDate } from "@/lib/format";
import { IMPACT_VERDICT_LABEL, IMPACT_WINDOW, type ImpactVerdict, type WindowStats } from "@/lib/impact";
import { shiftDate, today } from "@/lib/ranking";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Cambios y experimentos" };

const fmtMean = (n: number | null) => (n == null ? "–" : `#${n.toFixed(1).replace(".", ",")}`);

const VERDICT_TONE: Record<ImpactVerdict, string> = {
  up: "text-up",
  entered: "text-up",
  down: "text-down",
  left: "text-down",
  flat: "text-muted",
  unknown: "text-muted",
};

export default async function ChangesPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const [notes, experiments] = await Promise.all([getAnnotationsWithImpact(app.id), getExperiments(app.id)]);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Cambios
      </nav>
      <PageHeader title="Cambios y experimentos">
        Cada cambio de la ficha queda anotado en los gráficos de posición: los que escribes tú, los que la consulta diaria detecta en la ficha
        publicada (título, descripciones, versión, icono o capturas) y los que envías desde Rankeo. Para cada uno comparamos la posición media de
        los {IMPACT_WINDOW} días anteriores y posteriores en las keywords afectadas, las que contienen alguna palabra añadida o quitada.
      </PageHeader>

      <Card aria-label="Añadir anotación" className="px-5 py-5">
        <h2 className="text-[15px] font-semibold">Añadir anotación</h2>
        <p className="mt-1 mb-4 text-[13px] text-muted">Para lo que la tienda no muestra: una campaña, una mención en prensa, un cambio en otro país.</p>
        <AnnotationForm appId={app.id} defaultDate={today()} />
      </Card>

      <section aria-label="Anotaciones" className="flex flex-col gap-4">
        <div>
          <h2 className="text-[17px] font-semibold">Anotaciones de los últimos {CHANGES_DAYS} días</h2>
          <p className="mt-1 text-[13px] text-muted">
            Una correlación no demuestra la causa: las posiciones también se mueven por la competencia y por cambios de la tienda. Los días en
            que la app no salía entre los resultados no cuentan en la media (no sabemos en qué puesto estaba); se indican aparte.
          </p>
        </div>
        {notes.length === 0 ? (
          <Card className="px-5 py-8 text-center text-sm text-muted">
            Aún no hay anotaciones. La consulta diaria guarda la ficha publicada y anota el primer cambio que vea.
          </Card>
        ) : (
          notes.map((n) => <AnnotationCard key={n.annotation.id} appId={app.id} note={n} />)
        )}
      </section>

      <Card aria-label="Experimentos de ficha" className="overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">Experimentos de ficha</h2>
          <p className="mt-1 text-[13px] text-muted">
            {app.store === "android"
              ? "Google Play prueba variantes del icono, las capturas o las descripciones con una parte de los visitantes: el experimento se crea y se sigue en Play Console (Crecimiento → Experimentos de ficha de Play Store). Aquí planificas la prueba y apuntas el resultado que da Play y lo aprendido, para no repetir pruebas ni olvidar qué funcionó."
              : "App Store Connect lo llama «Prueba de la página de producto» y se crea y se sigue allí. Aquí planificas la prueba y apuntas el resultado y lo aprendido."}{" "}
            Rankeo no lee los resultados de la consola. Deja correr cada prueba al menos {MIN_EXPERIMENT_DAYS} días, para que cuenten días laborables
            y fines de semana, y cambia una sola cosa por prueba.
          </p>
        </div>
        <ul>
          {experiments.map((e) => (
            <li key={e.id} className="border-b border-line px-5 py-4">
              <details>
                <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 md:min-h-8">
                  <span className="font-semibold">{e.name}</span>
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">{EXPERIMENT_STATUS_LABEL[e.status]}</span>
                  {(e.startDate || e.endDate) && (
                    <span className="text-[13px] text-muted">
                      {formatDate(e.startDate)} – {formatDate(e.endDate)}
                    </span>
                  )}
                  {e.learned && <span className="basis-full text-[13px] text-ink-soft">{e.learned}</span>}
                </summary>
                <div className="mt-3">
                  <ExperimentForm appId={app.id} experiment={e} />
                </div>
              </details>
            </li>
          ))}
          <li className="px-5 py-4">
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Nuevo experimento</h3>
            <ExperimentForm appId={app.id} />
          </li>
        </ul>
      </Card>
    </div>
  );
}

function changeText(c: AnnotationChange): string {
  if (c.added || c.removed) {
    const parts = [c.added?.length ? `+ ${c.added.join(", ")}` : "", c.removed?.length ? `− ${c.removed.join(", ")}` : ""].filter(Boolean);
    return parts.length ? `${c.label}: ${parts.join(" · ")}` : `${c.label}: cambia el orden o la puntuación`;
  }
  if (c.before != null && c.after != null) return `${c.label}: ${c.before || "–"} → ${c.after || "–"}`;
  return c.label;
}

function daysNote(s: WindowStats): string {
  const parts = [`${s.ranked} ${s.ranked === 1 ? "día" : "días"} con posición`];
  if (s.outside) parts.push(`${s.outside} fuera`);
  if (s.unchecked) parts.push(`${s.unchecked} sin consultar`);
  return parts.join(", ");
}

function AnnotationCard({ appId, note }: { appId: number; note: AnnotationWithImpact }) {
  const { annotation: a, scope, rows, measured, summary } = note;
  const complete = rows.every((r) => r.impact.complete);
  const totals = (Object.keys(summary) as ImpactVerdict[]).filter((v) => summary[v] > 0).map((v) => `${IMPACT_VERDICT_LABEL[v]}: ${summary[v]}`);
  return (
    <Card aria-label={a.label} className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted">{formatDate(a.date)}</span>
            <AnnotationBadge source={a.source} />
          </div>
          <h3 className="mt-1 font-semibold">{a.label}</h3>
          {a.detail && a.detail.changes.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-ink-soft">
              {a.detail.changes.map((c) => (
                <li key={c.field} className="break-words">
                  {changeText(c)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <form action={removeAnnotation}>
          <input type="hidden" name="appId" value={appId} />
          <input type="hidden" name="annotationId" value={a.id} />
          <ConfirmButton message={`¿Borrar la anotación «${a.label}»?`} className="min-h-11 rounded-lg px-3 text-[13px] text-danger hover:bg-danger-soft md:min-h-8">
            Borrar
          </ConfirmButton>
        </form>
      </div>
      <div className="px-5 py-3 text-[13px] text-muted">
        {scope === "affected"
          ? `${measured} ${measured === 1 ? "keyword afectada" : "keywords afectadas"} (contienen una palabra que cambió).`
          : measured > 0
            ? `Sin palabras que cambiaran: se muestran las ${Math.min(rows.length, measured)} keywords que más se movieron de ${measured} con datos.`
            : "Sin palabras que cambiaran y sin posiciones alrededor de esta fecha."}
        {totals.length > 0 && ` ${totals.join(" · ")}.`}
        {!complete && ` Faltan días: la comparación se completa el ${formatDate(shiftDate(a.date, IMPACT_WINDOW))}.`}
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wider text-muted uppercase">
                <th scope="col" className="px-5 py-2 font-semibold">Keyword</th>
                <th scope="col" className="px-3 py-2 font-semibold">Media antes</th>
                <th scope="col" className="px-3 py-2 font-semibold">Media después</th>
                <th scope="col" className="px-5 py-2 font-semibold">Efecto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ keywordId, term, impact }) => (
                <tr key={keywordId} className="border-t border-line align-top">
                  <td className="px-5 py-2">
                    <Link href={`/apps/${appId}/keywords/${keywordId}`} className="text-link hover:underline">
                      {term}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono">{fmtMean(impact.before.mean)}</span>
                    <div className="text-xs text-muted">{daysNote(impact.before)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono">{fmtMean(impact.after.mean)}</span>
                    <div className="text-xs text-muted">{daysNote(impact.after)}</div>
                  </td>
                  <td className={`px-5 py-2 ${VERDICT_TONE[impact.verdict]}`}>
                    {impact.change != null && impact.verdict !== "flat" ? (
                      <PositionChange change={Math.round(impact.change)} />
                    ) : (
                      IMPACT_VERDICT_LABEL[impact.verdict]
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
