import type { FetchLike } from "../api-http";
import { signJwt } from "../jwt";

// Service-account auth for the Google Play Developer API (Android Publisher v3), without googleapis.
// Flow ("Using OAuth 2.0 for Server to Server Applications", "Preparing to make an authorized API call"
// → HTTP/REST): sign a JWT with RS256 (iss = client_email, scope, aud = token URL, iat, exp ≤ 1 h) and
// exchange it at https://oauth2.googleapis.com/token with grant_type jwt-bearer.
// https://developers.google.com/identity/protocols/oauth2/service-account — read on 2026-10-30.

export const PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
/** Google accepts at most one hour. */
const ASSERTION_TTL_S = 3600;

export type ServiceAccount = { clientEmail: string; privateKey: string; privateKeyId: string | null };

/** A config problem, with a Spanish message that never repeats the secret. */
export class PlayConfigError extends Error {}

/**
 * Reads the service account key from GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: the JSON file downloaded from
 * Google Cloud, pasted as is or encoded in base64 (handier in some hosting panels).
 */
export function parseServiceAccount(raw: string): ServiceAccount {
  const text = raw.trim();
  let json: unknown;
  try {
    json = JSON.parse(text.startsWith("{") ? text : Buffer.from(text, "base64").toString("utf8"));
  } catch {
    throw new PlayConfigError("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON no es un JSON válido (ni en texto ni en base64).");
  }
  const sa = json as { type?: string; client_email?: string; private_key?: string; private_key_id?: string };
  if (sa.type && sa.type !== "service_account") throw new PlayConfigError("La clave de GOOGLE_PLAY_SERVICE_ACCOUNT_JSON no es de una cuenta de servicio.");
  if (!sa.client_email || !sa.private_key) {
    throw new PlayConfigError("A GOOGLE_PLAY_SERVICE_ACCOUNT_JSON le falta client_email o private_key: descarga de nuevo la clave JSON.");
  }
  return { clientEmail: sa.client_email, privateKey: sa.private_key, privateKeyId: sa.private_key_id ?? null };
}

/** Claims of the JWT assertion. `now` in seconds. */
export function assertionClaims(sa: Pick<ServiceAccount, "clientEmail">, now: number) {
  return { iss: sa.clientEmail, scope: PLAY_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + ASSERTION_TTL_S };
}

export function signAssertion(sa: ServiceAccount, now: number): string {
  return signJwt({ alg: "RS256", typ: "JWT", ...(sa.privateKeyId ? { kid: sa.privateKeyId } : {}) }, assertionClaims(sa, now), sa.privateKey);
}

/** Form body of the token request. */
export function tokenRequestBody(assertion: string): URLSearchParams {
  return new URLSearchParams({ grant_type: JWT_BEARER_GRANT, assertion });
}

/**
 * Returns a function that gives a valid access token, asking Google only when the cached one is about
 * to expire (a minute of margin). The token stays in this server's memory; it is never logged.
 */
export function createTokenProvider(sa: ServiceAccount, opts: { fetch?: FetchLike; now?: () => number } = {}): () => Promise<string> {
  const fetchFn = opts.fetch ?? fetch;
  const nowMs = opts.now ?? Date.now;
  let cached: { token: string; expiresAt: number } | null = null;
  return async () => {
    if (cached && cached.expiresAt - 60_000 > nowMs()) return cached.token;
    let res: Response;
    try {
      res = await fetchFn(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenRequestBody(signAssertion(sa, Math.floor(nowMs() / 1000))).toString(),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
    } catch {
      throw new PlayConfigError("No se pudo conectar con Google para obtener el token de la cuenta de servicio.");
    }
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      // invalid_grant: wrong or revoked key, or the server clock is off.
      throw new PlayConfigError(
        `Google rechazó la cuenta de servicio (${body.error ?? res.status}${body.error_description ? `: ${body.error_description}` : ""}). Revisa la clave o créala de nuevo.`,
      );
    }
    cached = { token: body.access_token, expiresAt: nowMs() + (body.expires_in ?? 3600) * 1000 };
    return cached.token;
  };
}

export type PlayConfig = { configured: boolean; writeEnabled: boolean; error: string | null };

/** Whether the integration is set up and allowed to write. Read on every request (env can change between deploys). */
export function playConfig(env: Record<string, string | undefined> = process.env): PlayConfig {
  const raw = env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) return { configured: false, writeEnabled: false, error: null };
  try {
    parseServiceAccount(raw);
  } catch (err) {
    return { configured: false, writeEnabled: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { configured: true, writeEnabled: env.GOOGLE_PLAY_ALLOW_WRITE === "1", error: null };
}
