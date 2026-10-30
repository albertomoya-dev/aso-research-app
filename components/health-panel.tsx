import Link from "next/link";
import { Suspense } from "react";
import { type HealthItem, type HealthStatus, healthSummary, reviewsItem } from "@/lib/health";
import { loadHealth } from "@/lib/health-queries";
import { playConfig } from "@/lib/play-console/auth";
import { getPlayClient, playErrorMessage } from "@/lib/play-console/client";
import type { KeywordRow } from "@/lib/queries";
import type { AppMeta } from "@/lib/stores/types";
import { Card, Skeleton } from "./ui";

type PanelApp = { id: number; store: "ios" | "android"; country: string; storeId: string; meta: AppMeta };

const STATUS: Record<HealthStatus, { label: string; dot: string }> = {
  good: { label: "Bien", dot: "bg-up" },
  warn: { label: "Mejorable", dot: "bg-warn-fg" },
  bad: { label: "Necesita atención", dot: "bg-danger" },
  unknown: { label: "Sin datos", dot: "bg-line-strong" },
};

/**
 * «Salud ASO» card on the app's home (F12). Streams behind Suspense so the keyword table never waits for
 * it; the reviews line has its own boundary because it asks Google Play.
 */
export function HealthPanel({ app, rows }: { app: PanelApp; rows: KeywordRow[] }) {
  return (
    <Suspense fallback={<HealthSkeleton />}>
      <HealthCard app={app} rows={rows} />
    </Suspense>
  );
}

async function HealthCard({ app, rows }: { app: PanelApp; rows: KeywordRow[] }) {
  const items = await loadHealth(app, rows);
  const play = app.store === "android" && playConfig().configured;
  const counts = healthSummary(items);
  return (
    <Card aria-labelledby="health-title" className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-4">
        <h2 id="health-title" className="text-[17px] font-semibold">
          Salud ASO
        </h2>
        <p className="text-[13px] text-muted">
          {counts.bad > 0 && `${counts.bad} por atender · `}
          {counts.warn > 0 && `${counts.warn} mejorables · `}
          {counts.good} bien
        </p>
      </div>
      <ul className="-mb-px grid md:grid-cols-2">
        {items.map((item) => (
          <HealthRow key={item.id} item={item} />
        ))}
        {play ? (
          <Suspense
            fallback={<HealthRow item={{ ...reviewsItem({ store: "android", configured: true, unanswered: null, reviewsHref: "" }), hint: "Consultando Google Play…", href: null, action: null }} />}
          >
            <ReviewsRow app={app} />
          </Suspense>
        ) : (
          <HealthRow item={reviewsItem({ store: app.store, configured: false, unanswered: null, reviewsHref: `/apps/${app.id}/resenas` })} />
        )}
      </ul>
    </Card>
  );
}

async function ReviewsRow({ app }: { app: PanelApp }) {
  const client = getPlayClient();
  let item: HealthItem;
  try {
    if (!client) throw new Error("Play Console no está configurado.");
    const { reviews } = await client.listReviews(app.storeId, { maxResults: 50 });
    item = reviewsItem({
      store: "android",
      configured: true,
      unanswered: reviews.filter((r) => !r.reply).length,
      total: reviews.length,
      reviewsHref: `/apps/${app.id}/resenas`,
    });
  } catch (err) {
    item = reviewsItem({ store: "android", configured: true, unanswered: null, error: playErrorMessage(err), reviewsHref: `/apps/${app.id}/resenas` });
  }
  return <HealthRow item={item} />;
}

function HealthRow({ item }: { item: HealthItem }) {
  const status = STATUS[item.status];
  return (
    <li className="flex min-w-0 gap-3 border-b border-line px-5 py-3.5 md:odd:border-r">
      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${status.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-sm font-medium">{item.label}</h3>
          <span className="text-[13px] text-muted">
            {status.label} · <span className="font-mono text-ink-soft">{item.value}</span>
          </span>
        </div>
        <p className="mt-0.5 text-[13px] break-words text-muted">{item.hint}</p>
        {item.href && item.action && (
          <Link href={item.href} className="mt-1 inline-flex min-h-11 items-center text-[13px] text-link hover:underline md:min-h-6">
            {item.action} →
          </Link>
        )}
      </div>
    </li>
  );
}

function HealthSkeleton() {
  return (
    <Card aria-label="Salud ASO" aria-busy="true" className="flex flex-col gap-3 p-5">
      <Skeleton className="h-5 w-28" />
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </Card>
  );
}
