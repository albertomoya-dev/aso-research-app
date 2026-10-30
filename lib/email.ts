import { describeMove, weekPosition } from "./alerts";
import { formatDate, formatDay } from "./format";
import { type AppWeek, competitorChanges } from "./summary";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL);
}

/** Public URL for links in the email; Vercel sets VERCEL_PROJECT_PRODUCTION_URL on its own. */
export function appUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (v: number | null) => (v == null ? "–" : `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })}%`);

/** Plain table-based HTML: email clients ignore most CSS. */
export function renderSummaryEmail(summary: { since: string; until: string; apps: AppWeek[] }, baseUrl: string | null): string {
  const link = (path: string, text: string) => (baseUrl ? `<a href="${esc(baseUrl + path)}" style="color:#3046c5">${esc(text)}</a>` : esc(text));
  const move = (m: AppWeek["week"]["gainers"][number]) =>
    `${esc(m.term)}: ${esc(weekPosition(m.before, m.beforeDepth))} → ${esc(weekPosition(m.now, m.nowDepth))}${m.movement === "move" ? "" : ` (${describeMove(m)})`}`;
  const blocks = summary.apps.map(({ app, week, baselineDate, share, shareBefore, alerts }) => {
    const movers = [
      ...week.gainers.map((g) => `<li style="color:#1e7b46">▲ ${move(g)}</li>`),
      ...week.losers.map((l) => `<li style="color:#b42318">▼ ${move(l)}</li>`),
    ].join("");
    const changes = competitorChanges(alerts)
      .slice(0, 5)
      .map((a) => `<li>${esc(a.title)}${a.detail ? ` (${esc(a.detail)})` : ""}</li>`)
      .join("");
    return `
      <h2 style="font-size:17px;margin:24px 0 6px">${link(`/apps/${app.id}`, app.title)}</h2>
      <p style="margin:0 0 8px;color:#555">
        ${baselineDate ? `Frente al ${formatDay(baselineDate)}` : "Aún sin una consulta anterior con la que comparar"} ·
        ${week.tracked} keywords · ${week.improved} suben · ${week.worsened} bajan${week.noBaseline ? ` · ${week.noBaseline} nuevas sin comparación` : ""} ·
        TOP 10: ${week.top10} (antes ${week.top10Before}) · cuota de visibilidad ${pct(share)} (antes ${pct(shareBefore)})
      </p>
      ${movers ? `<ul style="margin:0 0 8px;padding-left:18px">${movers}</ul>` : ""}
      ${changes ? `<p style="margin:8px 0 4px;font-weight:600">Cambios de competidores</p><ul style="margin:0;padding-left:18px">${changes}</ul>` : ""}`;
  });
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#1a1d24;max-width:640px;margin:0 auto;padding:16px">
    <h1 style="font-size:20px;margin:0 0 4px">Resumen semanal de ASO</h1>
    <p style="margin:0;color:#555">Del ${formatDate(summary.since)} al ${formatDate(summary.until)} · ${link("/resumen", "Ver en Rankeo")}</p>
    ${blocks.join("") || "<p>No sigues ninguna app todavía.</p>"}
  </body></html>`;
}

/** Sends through Resend's HTTP API (free tier: 100 emails a day). */
export async function sendEmail(subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Rankeo <onboarding@resend.dev>",
      to: [process.env.ALERT_EMAIL],
      subject,
      html,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
