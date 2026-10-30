import { withRetry } from "./stores/retry";

// Small JSON-over-HTTP helper for the store console APIs (Google Play Developer API, App Store Connect
// API). The fetch is injectable so the tests never touch the network.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** An HTTP error from a store API. `message` is Spanish and safe to show; it never includes credentials. */
export class StoreApiError extends Error {
  constructor(
    message: string,
    /** Undefined for network errors and timeouts (no answer): lib/stores/retry treats those as retryable. */
    readonly status: number | undefined,
    /** The API's own message (English), kept apart for the logs of the user's own console. */
    readonly detail = "",
  ) {
    super(message);
    this.name = "StoreApiError";
  }
}

export type JsonRequest = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  /** Default 20 s. */
  timeoutMs?: number;
  /** Retry 429, 5xx and network errors (0.5 s, 1 s, 2 s). Only for requests that are safe to repeat. */
  retry?: boolean;
};

/**
 * Sends a JSON request and returns the parsed body (null for 204 or an empty body). Non-2xx answers
 * throw StoreApiError with the message from `explain(status, apiMessage)`.
 */
export async function fetchJson<T>(
  fetchFn: FetchLike,
  url: string,
  req: JsonRequest,
  explain: (status: number, apiMessage: string) => string,
): Promise<T | null> {
  const run = async () => {
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: req.method ?? "GET",
        headers: { Accept: "application/json", ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}), ...req.headers },
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: AbortSignal.timeout(req.timeoutMs ?? 20_000),
        cache: "no-store",
      });
    } catch (err) {
      const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new StoreApiError(timeout ? "La tienda tardó demasiado en responder." : "No se pudo conectar con la tienda.", undefined);
    }
    const text = await res.text();
    if (!res.ok) {
      const apiMessage = apiErrorMessage(text);
      throw new StoreApiError(explain(res.status, apiMessage), res.status, apiMessage);
    }
    return text ? (JSON.parse(text) as T) : null;
  };
  return req.retry ? withRetry(run) : run();
}

/** Google: {error: {message}}; Apple: {errors: [{title, detail}]}. Falls back to the first 200 characters. */
export function apiErrorMessage(body: string): string {
  try {
    const json = JSON.parse(body) as { error?: { message?: string }; errors?: { title?: string; detail?: string }[] };
    if (json.error?.message) return json.error.message;
    if (json.errors?.length) return json.errors.map((e) => [e.title, e.detail].filter(Boolean).join(": ")).join(" · ");
  } catch {
    // Not JSON.
  }
  return body.slice(0, 200);
}
