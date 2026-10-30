import { NextResponse, type NextRequest } from "next/server";
import { generateRankAlerts } from "@/lib/alert-jobs";
import { trackCompetitors } from "@/lib/competitors";
import { runStep } from "@/lib/cron-step";
import { appUrl, emailConfigured, renderSummaryEmail, sendEmail } from "@/lib/email";
import { trackOwnListings } from "@/lib/own-listings";
import { today } from "@/lib/ranking";
import { generateSeasonalAlerts } from "@/lib/seasonality-jobs";
import { getWeeklySummaries } from "@/lib/summary";
import { trackRankings } from "@/lib/tracking";

// Searching every keyword can take a while; Vercel allows up to 300 s on the free plan.
export const maxDuration = 300;
/** Own listings are fetched only while this much of the budget is left, so the response still goes out. */
const OWN_LISTINGS_RESERVE_MS = 30_000;

/**
 * Daily job (see vercel.json): positions, ranking alerts, coming seasonal peaks, competitor listings,
 * the weekly email on Mondays and, last and only while time is left, own listings (automatic annotations).
 * Each step is isolated: one failing does not stop the rest. Vercel Cron sends CRON_SECRET as a bearer token.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const deadline = Date.now() + maxDuration * 1000 - OWN_LISTINGS_RESERVE_MS;
  const rankings = await runStep(() => trackRankings());
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
  const ownListings = await runStep(() => trackOwnListings({}, deadline));

  const report = rankings.ok ? rankings.value : null;
  // 502 only when ranking tracking failed completely: nothing searched at all.
  const rankingsFailed = !report || (report.errors.length > 0 && report.searches === 0);
  return NextResponse.json(
    {
      ...report,
      ...(rankings.ok ? {} : { rankingsError: rankings.error }),
      alerts,
      seasonal,
      competitors,
      email,
      ownListings,
    },
    { status: rankingsFailed ? 502 : 200 },
  );
}
