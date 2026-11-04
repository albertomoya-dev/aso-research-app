import { FileText, Image as ImageIcon, LayoutGrid, Megaphone, Package, Send, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { AnnotationBadge } from "@/components/annotation-badge";
import { PositionChange } from "@/components/rank";
import { DeltaBadge } from "@/components/ui/delta-badge";
import type { AnnotationWithImpact } from "@/lib/annotation-queries";
import type { AnnotationChange } from "@/lib/annotations";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { IMPACT_VERDICT_LABEL, IMPACT_WINDOW, type ImpactVerdict, type WindowStats } from "@/lib/impact";
import { shiftDate } from "@/lib/ranking";
import { groupByMonth, impactLine, isDetected, TIMELINE_KIND_LABEL, type TimelineKind, timelineKind } from "@/lib/timeline";
import { DeleteChangeButton } from "./change-dialogs";

const KIND_ICON: Record<TimelineKind, LucideIcon> = {
  listing: FileText,
  version: Package,
  icon: ImageIcon,
  screenshots: LayoutGrid,
  publish: Send,
  manual: Megaphone,
};

const VERDICT_TONE: Record<ImpactVerdict, string> = {
  up: "text-up",
  entered: "text-up",
  down: "text-down",
  left: "text-down",
  flat: "text-muted",
  unknown: "text-muted",
};

const fmtMean = (n: number | null) => (n == null ? "–" : `#${n.toFixed(1).replace(".", ",")}`);

/**
 * Cambios y pruebas (phase 32): every change of the last months on a vertical line, by month. Detected
 * ones (listing, version, icon, screenshots, publications) and manual ones look alike but carry their
 * kind; each shows its impact over the 14 days before and after, and the keywords behind it on demand.
 */
export function ChangesTimeline({ appId, keywordsHref, notes }: { appId: number; keywordsHref: string; notes: AnnotationWithImpact[] }) {
  const groups = groupByMonth(notes, (n) => n.annotation.date);
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <h3 className="mb-2 text-label font-medium text-muted first-letter:uppercase">{g.label}</h3>
          <ol className="relative flex flex-col gap-3 border-l border-line pl-6 sm:ml-2">
            {g.items.map((n) => (
              <TimelineEntry key={n.annotation.id} appId={appId} keywordsHref={keywordsHref} note={n} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function TimelineEntry({ appId, keywordsHref, note }: { appId: number; keywordsHref: string; note: AnnotationWithImpact }) {
  const { annotation: a, scope, rows, aggregate } = note;
  const kind = timelineKind(a);
  const Icon = KIND_ICON[kind];
  const line = impactLine(aggregate, scope);
  const detected = isDetected(kind);
  return (
    <li aria-label={a.label} className="relative" data-kind={kind}>
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-3 -left-9.25 flex size-6 items-center justify-center rounded-full border",
          detected ? "border-brand bg-brand-soft text-brand-strong" : "border-line-strong bg-surface text-ink-soft",
        )}
      >
        <Icon size={12} />
      </span>
      <article className="rounded-card border border-line bg-surface">
        <div className="flex items-start justify-between gap-3 px-4 pt-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-label text-muted">
              <time dateTime={a.date}>{formatDate(a.date)}</time>
              {/* Manual and publish entries are already named by their source badge. */}
              {a.source === "auto" && <span className="rounded-full bg-surface-muted px-1.5 py-px font-medium text-ink-soft">{TIMELINE_KIND_LABEL[kind]}</span>}
              <AnnotationBadge source={a.source} />
            </div>
            <h4 className="mt-1 font-semibold wrap-break-word text-ink">{a.label}</h4>
            {a.detail && a.detail.changes.length > 0 && (
              <ul data-content className="mt-1 flex flex-col gap-0.5 text-[13px] text-ink-soft">
                {a.detail.changes.map((c) => (
                  <li key={c.field} className="wrap-break-word">
                    {changeText(c)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DeleteChangeButton appId={appId} annotationId={a.id} label={a.label} />
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-2 pb-3 text-[13px] text-ink-soft" data-impact data-content>
          {line.text ? (
            <>
              <span>{line.text}</span>
              <DeltaBadge delta={line.delta} noun="posiciones de media" />
            </>
          ) : (
            <span className="text-muted">{IMPACT_VERDICT_LABEL.unknown}</span>
          )}
          {line.extras.map((x) => (
            <span key={x} className="text-muted">
              · {x}
            </span>
          ))}
          {!aggregate.complete && <span className="text-muted">· se completa el {formatDate(shiftDate(a.date, IMPACT_WINDOW))}</span>}
        </p>
        {rows.length > 0 && (
          <details className="border-t border-line">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[13px] text-link md:min-h-9">
              {scope === "affected" ? "Ver las keywords afectadas" : "Ver las keywords que más se movieron"}
            </summary>
            <ImpactTable rows={rows} keywordsHref={keywordsHref} />
          </details>
        )}
      </article>
    </li>
  );
}

function ImpactTable({ rows, keywordsHref }: { rows: AnnotationWithImpact["rows"]; keywordsHref: string }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-140 text-[13px]">
        <thead>
          <tr className="text-left text-label text-muted">
            <th scope="col" className="px-4 py-2 font-medium">Keyword</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Antes</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Después</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Efecto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ keywordId, term, impact }) => (
            <tr key={keywordId} className="border-t border-line align-top">
              <td className="px-4 py-2">
                <Link href={`${keywordsHref}/${keywordId}`} className="text-link hover:underline">
                  {term}
                </Link>
              </td>
              <td className="px-3 py-2 text-right">
                <span className="font-mono">{fmtMean(impact.before.mean)}</span>
                <div className="text-xs text-muted">{daysNote(impact.before)}</div>
              </td>
              <td className="px-3 py-2 text-right">
                <span className="font-mono">{fmtMean(impact.after.mean)}</span>
                <div className="text-xs text-muted">{daysNote(impact.after)}</div>
              </td>
              <td className={`px-4 py-2 text-right ${VERDICT_TONE[impact.verdict]}`}>
                {impact.change != null && impact.verdict !== "flat" ? <PositionChange change={Math.round(impact.change)} /> : IMPACT_VERDICT_LABEL[impact.verdict]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
