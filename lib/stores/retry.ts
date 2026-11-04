import pLimit from "p-limit";

/** At most 3 concurrent requests per store, to stay under the stores' rate limits. */
export const limiters = { ios: pLimit(3), android: pLimit(3) };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** An aborted or timed-out request (AbortSignal): never retried. */
export function isAbort(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

export function isRetryable(error: unknown): boolean {
  if (isAbort(error)) return false;
  const status = (error as { status?: number }).status;
  return status === undefined || status === 429 || status >= 500;
}

/** Retries 429, 5xx and network errors with exponential backoff (0.5s, 1s, 2s). */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4, baseMs = 500, signal?: AbortSignal): Promise<T> {
  for (let i = 0; ; i++) {
    signal?.throwIfAborted();
    try {
      return await fn();
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (i >= attempts - 1 || !isRetryable(error)) throw error;
      await sleep(baseMs * 2 ** i);
    }
  }
}

/**
 * `promise`, or the signal's reason as soon as it aborts. For calls that take no signal themselves (the
 * Google Play scraper, a slot of the store limiter): the work may go on in the background, but nobody
 * waits for it.
 */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
