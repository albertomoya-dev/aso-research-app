import { NextResponse, type NextRequest } from "next/server";
import { trackCompetitors } from "@/lib/competitors";
import { trackRankings } from "@/lib/tracking";

// Searching every keyword can take a while; Vercel allows up to 300 s on the free plan.
export const maxDuration = 300;

/** Daily job (see vercel.json): positions, then competitor listings. Vercel Cron sends CRON_SECRET as a bearer token. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const report = await trackRankings();
  const competitors = await trackCompetitors();
  return NextResponse.json({ ...report, competitors }, { status: report.errors.length > 0 && report.searches === 0 ? 502 : 200 });
}
