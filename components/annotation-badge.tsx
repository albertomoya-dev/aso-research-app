import { ANNOTATION_SOURCE_LABEL, type AnnotationSource } from "@/lib/annotations";

const TONE: Record<AnnotationSource, string> = {
  manual: "bg-surface-muted text-ink-soft",
  auto: "bg-brand-soft text-brand-strong",
  publish: "bg-warn-bg text-warn-fg",
};

const TITLE: Record<AnnotationSource, string> = {
  manual: "La escribiste tú",
  auto: "La consulta diaria vio que la ficha publicada cambió",
  publish: "Se envió desde Rankeo a la consola de la tienda",
};

/** Where an annotation came from: manual, automatic (daily job) or a publication from Rankeo. */
export function AnnotationBadge({ source }: { source: AnnotationSource }) {
  return (
    <span title={TITLE[source]} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONE[source]}`}>
      {ANNOTATION_SOURCE_LABEL[source]}
    </span>
  );
}
