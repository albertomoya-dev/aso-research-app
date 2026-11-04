import { History } from "lucide-react";
import type { Metadata } from "next";
import { AddChangeDialog } from "@/components/changes/change-dialogs";
import { ExperimentBoard } from "@/components/changes/experiment-board";
import { ChangesTimeline } from "@/components/changes/timeline";
import { PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpTip } from "@/components/ui/help-tip";
import { CHANGES_DAYS, getAnnotationsWithImpact, getExperiments } from "@/lib/annotation-queries";
import { loadMarketParams, marketPath } from "@/lib/products";
import { MIN_EXPERIMENT_DAYS } from "@/lib/experiments";
import { IMPACT_WINDOW } from "@/lib/impact";
import { today } from "@/lib/ranking";

type Props = { params: Promise<{ app: string; market: string }> };

export const metadata: Metadata = { title: "Cambios y pruebas" };

export default async function ChangesPage({ params }: Props) {
  const app = await loadMarketParams(params);
  const [notes, experiments] = await Promise.all([getAnnotationsWithImpact(app.id), getExperiments(app.id)]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Cambios y pruebas" actions={<AddChangeDialog appId={app.id} defaultDate={today()} />}>
        <span className="inline-flex items-center gap-1">
          Lo que cambió en la ficha y cómo se movieron tus keywords los {IMPACT_WINDOW} días de antes y de después.
          <HelpTip label="Cambios y pruebas">
            La consulta diaria detecta los cambios de la ficha publicada (título, descripciones, versión, icono, capturas) y Rankeo anota lo que
            publicas. Las keywords afectadas son las que contienen una palabra añadida o quitada. Una correlación no demuestra la causa, y los días
            fuera de los resultados no cuentan en la media.
          </HelpTip>
        </span>
      </PageHeader>

      <section aria-labelledby="timeline-title" className="flex flex-col gap-3">
        <h2 id="timeline-title" className="text-card-title font-semibold">
          Línea de tiempo <span className="text-[13px] font-normal text-muted">· últimos {CHANGES_DAYS} días</span>
        </h2>
        {notes.length === 0 ? (
          <div className="rounded-card border border-line bg-surface">
            <EmptyState
              icon={History}
              title="Aún no hay cambios"
              description="La consulta diaria anota el primer cambio que vea en la ficha; tú puedes añadir campañas o menciones en prensa."
            />
          </div>
        ) : (
          <ChangesTimeline appId={app.id} keywordsHref={marketPath(app, "/keywords")} notes={notes} />
        )}
      </section>

      <section aria-labelledby="experiments-title" className="flex flex-col gap-3">
        <h2 id="experiments-title" className="flex items-center gap-1 text-card-title font-semibold">
          Experimentos de ficha
          <HelpTip label="Experimentos de ficha">
            {app.store === "android"
              ? "Google Play prueba variantes del icono, las capturas o las descripciones con una parte de los visitantes; el experimento se crea y se sigue en Play Console (Crecimiento → Experimentos de ficha de Play Store)."
              : "App Store Connect lo llama «Prueba de la página de producto», y se crea y se sigue allí."}{" "}
            Aquí planificas la prueba y apuntas el resultado y lo aprendido. Deja correr cada una al menos {MIN_EXPERIMENT_DAYS} días y cambia una
            sola cosa.
          </HelpTip>
        </h2>
        <ExperimentBoard appId={app.id} experiments={experiments} />
      </section>
    </div>
  );
}
