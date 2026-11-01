export type StepResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Runs one step of the job; a failure is reported instead of aborting the steps after it. */
export async function runStep<T>(run: () => Promise<T>): Promise<StepResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The platform kills the daily job after this long (route `maxDuration`, Vercel free plan). */
export const CRON_MAX_MS = 300_000;
/** No popularity measure (16 store autocomplete requests each) starts after this point; positions are still searched. */
export const POPULARITY_STOP_AT_MS = 180_000;
/** Own listings are not fetched after this point of the run. They go before relevance, so its backlog cannot starve them. */
export const OWN_LISTINGS_STOP_AT_MS = 200_000;
/** Relevance batches are not started after this point of the run: a batch still running ends by `+ RELEVANCE_CALL_TIMEOUT_MS`. */
export const RELEVANCE_STOP_AT_MS = 240_000;
/** One relevance request in the cron: abandoned after this long and never retried. */
export const RELEVANCE_CALL_TIMEOUT_MS = 40_000;
/** Every Claude request of the job is aborted at this point, whatever its own timeout, so the response still goes out. */
export const CRON_HARD_CAP_MS = 290_000;

export type CronBudget = {
  /** Epoch ms after which no popularity measure starts. */
  popularityDeadline: number;
  /** Epoch ms after which no own listing is fetched. */
  ownListingsDeadline: number;
  /** Epoch ms after which no relevance batch starts. */
  relevanceDeadline: number;
  /** Per-request options for the relevance calls: short timeout, no retries, aborted at the hard cap. */
  relevanceCall: { timeoutMs: number; maxRetries: number; signal: AbortSignal };
};

/** Aborts with a TimeoutError after `ms`, or right away when the cap has already passed. */
function hardCapSignal(ms: number): AbortSignal {
  return ms > 0 ? AbortSignal.timeout(ms) : AbortSignal.abort(new DOMException("The cron hard cap was reached.", "TimeoutError"));
}

/**
 * Time budget of the daily job, measured from when the route started (not from when a step starts),
 * so a slow earlier step shrinks the later ones instead of pushing them past the platform's kill.
 * Order of the deadlines: popularity (180 s) → own listings (200 s) → relevance (240 s). Worst case: a
 * relevance batch started just before `relevanceDeadline` gives up `RELEVANCE_CALL_TIMEOUT_MS` later
 * (280 s); in any case the hard cap aborts it at 290 s, before the 300 s kill. `now` is for tests.
 */
export function cronBudget(start: number, now = Date.now()): CronBudget {
  return {
    popularityDeadline: start + POPULARITY_STOP_AT_MS,
    ownListingsDeadline: start + OWN_LISTINGS_STOP_AT_MS,
    relevanceDeadline: start + RELEVANCE_STOP_AT_MS,
    relevanceCall: {
      timeoutMs: RELEVANCE_CALL_TIMEOUT_MS,
      maxRetries: 0,
      signal: hardCapSignal(start + CRON_HARD_CAP_MS - now),
    },
  };
}
