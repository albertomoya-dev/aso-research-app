import pLimit from "p-limit";

/** At most 3 concurrent requests per store, to stay under the stores' rate limits. */
export const limiters = { ios: pLimit(3), android: pLimit(3) };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  return status === undefined || status === 429 || status >= 500;
}

/** Retries 429, 5xx and network errors with exponential backoff (0.5s, 1s, 2s). */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4, baseMs = 500): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i >= attempts - 1 || !isRetryable(error)) throw error;
      await sleep(baseMs * 2 ** i);
    }
  }
}
