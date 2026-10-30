import { NextResponse, type NextRequest } from "next/server";
import { generateRankAlerts } from "@/lib/alert-jobs";
import { trackCompetitors } from "@/lib/competitors";
import { appUrl, emailConfigured, renderSummaryEmail, sendEmail } from "@/lib/email";
import { trackOwnListings } from "@/lib/own-listings";
import { today } from "@/lib/ranking";
import { generateSeasonalAlerts } from "@/lib/seasonality-jobs";
import { getWeeklySummaries } from "@/lib/summary";
import { trackRankings } from "@/lib/tracking";

// Searching every keyword can take a while; Vercel allows up to 300 s on the free plan.
export const maxDuration = 300;
/** Own listings are fetched only while this much of the budget is left, so the rest of the job still fits. */
const OWN_LISTINGS_RESERVE_MS = 60_000;

/**
 * Daily job (see vercel.json): positions, ranking alerts, coming seasonal peaks, own listings (automatic
 * annotations), competitor listings and, on Mondays,
 * the weekly email. Vercel Cron sends CRON_SECRET as a bearer token.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const startedAt = Date.now();
  const report = await trackRankings();
  const alerts = await generateRankAlerts(today());
  const seasonal = await generateSeasonalAlerts(today());
  const ownListings = await trackOwnListings({}, startedAt + maxDuration * 1000 - OWN_LISTINGS_RESERVE_MS);
  const competitors = await trackCompetitors();

  // Weekly summary by email on Mondays, when Resend is configured.
  let email: string | null = null;
  if (new Date().getUTCDay() === 1 && emailConfigured()) {
    try {
      await sendEmail("Resumen semanal de ASO", renderSummaryEmail(await getWeeklySummaries(), appUrl()));
      email = "sent";
    } catch (error) {
      email = error instanceof Error ? error.message : String(error);
    }
  }
  return NextResponse.json(
    { ...report, alerts, seasonal, ownListings, competitors, email },
    { status: report.errors.length > 0 && report.searches === 0 ? 502 : 200 },
  );
}
