import pLimit from "p-limit";
import { withRetry } from "./stores/retry";

export type TrendPoint = { date: string; value: number };

const BASE = "https://trends.google.com/trends/api";
// Google Trends has no public API and throttles hard, so one request at a time.
const limit = pLimit(1);

class TrendsError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

/** Google prefixes its JSON with ")]}'" to stop it being run as a script. */
export function parseTrendsJson<T>(body: string): T {
  return JSON.parse(body.slice(body.indexOf("{")));
}

export function toPoints(data: { default: { timelineData: { time: string; value: number[] }[] } }): TrendPoint[] {
  return data.default.timelineData.map((d) => ({
    date: new Date(Number(d.time) * 1000).toISOString().slice(0, 10),
    value: d.value[0] ?? 0,
  }));
}

async function get(url: string, cookie: string): Promise<string> {
  const res = await fetch(url, { headers: { cookie }, cache: "no-store" });
  if (!res.ok) throw new TrendsError(`Google Trends respondió ${res.status}`, res.status);
  return res.text();
}

/**
 * Weekly search interest on Google for the last 12 months in one country, 0–100
 * relative to the keyword's own peak. It is not comparable between keywords.
 */
export async function fetchInterest(term: string, country: string, lang: string): Promise<TrendPoint[]> {
  return limit(() =>
    withRetry(
      async () => {
        // Without the NID cookie from the home page Google answers 429.
        const home = await fetch(`https://trends.google.com/?geo=${country.toUpperCase()}`, { cache: "no-store" });
        const cookie = (home.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

        const explore = {
          comparisonItem: [{ keyword: term, geo: country.toUpperCase(), time: "today 12-m" }],
          category: 0,
          property: "",
        };
        const params = (req: unknown, token?: string) =>
          new URLSearchParams({ hl: lang, tz: "0", req: JSON.stringify(req), ...(token ? { token } : {}) });

        const { widgets } = parseTrendsJson<{ widgets: { id: string; token: string; request: unknown }[] }>(
          await get(`${BASE}/explore?${params(explore)}`, cookie),
        );
        const series = widgets.find((w) => w.id === "TIMESERIES");
        if (!series) throw new TrendsError("Google Trends no devolvió la serie temporal", 404);

        const data = parseTrendsJson<Parameters<typeof toPoints>[0]>(
          await get(`${BASE}/widgetdata/multiline?${params(series.request, series.token)}`, cookie),
        );
        return toPoints(data);
      },
      3,
      2000,
    ),
  );
}
