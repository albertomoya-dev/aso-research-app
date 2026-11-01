import { NextResponse, type NextRequest } from "next/server";
import { generateRankAlerts } from "@/lib/alert-jobs";
import { trackCompetitors } from "@/lib/competitors";
import { cronBudget, runStep } from "@/lib/cron-step";
import { appUrl, emailConfigured, renderSummaryEmail, sendEmail } from "@/lib/email";
import { trackOwnListings } from "@/lib/own-listings";
import { rateUnratedKeywords } from "@/lib/relevance-jobs";
import { today } from "@/lib/ranking";
import { generateSeasonalAlerts } from "@/lib/seasonality-jobs";
import { getWeeklySummaries } from "@/lib/summary";
import { trackRankings } from "@/lib/tracking";

// Searching every keyword can take a while; Vercel allows up to 300 s on the free plan (CRON_MAX_MS).
export const maxDuration = 300;

/**
 * Daily job (see vercel.json): positions, ranking alerts, coming seasonal peaks, competitor listings,
 * the weekly email on Mondays, own listings (automatic annotations) and, last, the AI relevance of
 * keywords still unrated (at most 200). Own listings go before relevance because they are cheap and its
 * backlog of Claude calls could otherwise leave them no time. Relevance runs after the alerts on purpose:
 * its Claude calls are the slowest part, and an alert that needs a relevance just set uses it from the
 * next day's run. Popularity measures, own listings and relevance batches have deadlines measured from
 * the start of the route, and every Claude call is aborted at the hard cap (see `cronBudget`).
 * Each step is isolated: one failing does not stop the rest. Vercel Cron sends CRON_SECRET as a bearer token.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const budget = cronBudget(Date.now());
  const rankings = await runStep(() => trackRankings({}, { popularityDeadline: budget.popularityDeadline }));
  const alerts = await runStep(() => generateRankAlerts(today()));
  const seasonal = await runStep(() => generateSeasonalAlerts(today()));
  const competitors = await runStep(() => trackCompetitors());

  // Weekly summary by email on Mondays, when Resend is configured.
  const email =
    new Date().getUTCDay() === 1 && emailConfigured()
      ? await runStep(async () => {
          await sendEmail("Resumen semanal de ASO", renderSummaryEmail(await getWeeklySummaries(), appUrl()));
          return "sent" as const;
        })
      : null;
  const ownListings = await runStep(() => trackOwnListings({}, budget.ownListingsDeadline));
  const relevance = await runStep(() =>
    rateUnratedKeywords({ deadline: budget.relevanceDeadline, request: budget.relevanceCall }),
  );

  const report = rankings.ok ? rankings.value : null;
  // 502 only when ranking tracking failed completely: nothing searched at all.
  const rankingsFailed = !report || (report.errors.length > 0 && report.searches === 0);
  return NextResponse.json(
    {
      ...report,
      ...(rankings.ok ? {} : { rankingsError: rankings.error }),
      relevance,
      alerts,
      seasonal,
      competitors,
      email,
      ownListings,
    },
    { status: rankingsFailed ? 502 : 200 },
  );
}
