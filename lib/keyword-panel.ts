import type { App } from "@/db/schema";
import { type ChartPoint, dailySeries } from "./chart-data";
import { watchedStoreIds } from "./competitor-queries";
import type { KeywordSource } from "./keywords";
import { getListingDraft } from "./listing-draft-queries";
import { mainLocale } from "./listing-drafts";
import { draftFromMeta, FIELDS, weightedCoverage } from "./metadata-check";
import { ANNOTATION_WINDOW, getKeywordDetail } from "./queries";
import { averagePosition, positionChange, RANK_DEPTH, shiftDate, today } from "./ranking";
import type { KeywordIntent, RelevanceSource } from "./relevance";
import type { AppSummary } from "./stores/types";

/** Days of the position chart in the detail panel. */
export const PANEL_DAYS = 90;

/** Everything the keyword detail panel (`?k=`) shows. Plain data: it travels from a server action. */
export type KeywordPanelData = {
  id: number;
  term: string;
  source: KeywordSource;
  relevance: number | null;
  relevanceSource: RelevanceSource | null;
  intent: KeywordIntent | null;
  position: number | null;
  depth: number | null;
  checkedOn: string | null;
  changeWeek: number | null;
  popularity: number | null;
  difficulty: number | null;
  opportunity: number | null;
  series: ChartPoint[];
  /** Deepest result count in the range (the chart axis). */
  axisDepth: number;
  /** Annotations of the range, oldest first, numbered as on the chart, with the average position around them. */
  annotations: { index: number; date: string; label: string; before: number | null; after: number | null }[];
  /** The latest TOP 10 (or TOP 5 for snapshots older than migration 0021). */
  top: AppSummary[];
  topSize: 5 | 10;
  ownStoreId: string;
  watched: string[];
  /** Fields of the main listing (its saved draft, else the published one) holding the exact phrase. */
  coverage: { fields: string[]; partial: boolean; against: "draft" | "published" };
};

export async function loadKeywordPanel(app: App, keywordId: number): Promise<KeywordPanelData | null> {
  const [detail, watched, draft] = await Promise.all([
    getKeywordDetail(app, keywordId, PANEL_DAYS),
    watchedStoreIds(app.id),
    getListingDraft(app.id, mainLocale(app.country)),
  ]);
  if (!detail) return null;
  const { keyword, since, history, latest, annotations, metrics } = detail;
  const end = today();
  const series = dailySeries(history, since, end);
  const depths = series.flatMap((p) => (p.depth != null ? [p.depth] : []));
  const weekAgo = latest ? history.find((h) => h.date === shiftDate(latest.date, -7)) : undefined;
  const listing = draft?.draft ?? draftFromMeta(app.meta);
  const item = weightedCoverage(app.store, listing, [{ term: keyword.term, opportunity: metrics.opportunity }]).items[0];
  const labels = new Map(FIELDS[app.store].map((f) => [f.key, f.label]));
  const top10 = latest?.top10;
  return {
    id: keyword.id,
    term: keyword.term,
    source: keyword.source,
    relevance: keyword.relevance,
    relevanceSource: keyword.relevanceSource,
    intent: keyword.intent,
    position: latest?.position ?? null,
    depth: latest?.depth ?? null,
    checkedOn: latest?.date ?? null,
    changeWeek: positionChange(latest?.position, weekAgo?.position),
    popularity: metrics.popularity,
    difficulty: metrics.difficulty,
    opportunity: metrics.opportunity,
    series,
    axisDepth: depths.length ? Math.max(...depths) : RANK_DEPTH,
    annotations: [...annotations]
      .reverse()
      .map((a, i) => ({
        index: i + 1,
        date: a.date,
        label: a.label,
        before: averagePosition(history, shiftDate(a.date, -ANNOTATION_WINDOW), shiftDate(a.date, -1)),
        after: averagePosition(history, shiftDate(a.date, 1), shiftDate(a.date, ANNOTATION_WINDOW)),
      })),
    top: (top10 && top10.length > 0 ? top10 : (latest?.top5 ?? [])).slice(0, 10),
    topSize: top10 && top10.length > 0 ? 10 : 5,
    ownStoreId: app.storeId,
    watched: [...watched],
    coverage: { fields: item.fields.map((f) => labels.get(f) ?? f), partial: item.partial, against: draft ? "draft" : "published" },
  };
}
