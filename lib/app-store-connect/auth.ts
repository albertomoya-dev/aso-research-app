import { normalizePem, signJwt, toPrivateKey } from "../jwt";

// App Store Connect API keys (team keys): every request carries a JWT signed with ES256 by the .p8
// private key downloaded from App Store Connect › Users and Access › Integrations.
// "Generating Tokens for API Requests":
// https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests — read on 2026-10-30.
//   header  {alg: "ES256", kid: <key id>, typ: "JWT"}
//   payload {iss: <issuer id>, iat, exp (at most 20 minutes after iat), aud: "appstoreconnect-v1"}

export const ASC_AUDIENCE = "appstoreconnect-v1";
/** Apple rejects tokens that expire more than 20 minutes in the future. */
export const ASC_MAX_TTL_S = 20 * 60;
const DEFAULT_TTL_S = 15 * 60;

export class AscConfigError extends Error {}

export type AscCredentials = { issuerId: string; keyId: string; privateKey: string };
export type AscConfig = { configured: boolean; writeEnabled: boolean; error: string | null };

/** Reads ASC_ISSUER_ID, ASC_KEY_ID and ASC_PRIVATE_KEY (the .p8 PEM; "\n" escapes allowed). Null when none is set. */
export function ascCredentials(env: Record<string, string | undefined> = process.env): AscCredentials | null {
  const issuerId = env.ASC_ISSUER_ID?.trim();
  const keyId = env.ASC_KEY_ID?.trim();
  const raw = env.ASC_PRIVATE_KEY?.trim();
  if (!issuerId && !keyId && !raw) return null;
  if (!issuerId || !keyId || !raw) throw new AscConfigError("Faltan variables de App Store Connect: hacen falta ASC_ISSUER_ID, ASC_KEY_ID y ASC_PRIVATE_KEY.");
  const privateKey = normalizePem(raw);
  try {
    const key = toPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "ec") throw new Error("not ec");
  } catch {
    throw new AscConfigError("ASC_PRIVATE_KEY no es una clave privada válida de App Store Connect (archivo .p8, empieza por «-----BEGIN PRIVATE KEY-----»).");
  }
  return { issuerId, keyId, privateKey };
}

export function ascConfig(env: Record<string, string | undefined> = process.env): AscConfig {
  try {
    const creds = ascCredentials(env);
    return { configured: creds != null, writeEnabled: creds != null && env.ASC_ALLOW_WRITE === "1", error: null };
  } catch (err) {
    return { configured: false, writeEnabled: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Claims of the token. `now` in seconds; the lifetime is capped at Apple's 20 minutes. */
export function ascClaims(issuerId: string, now: number, ttlSeconds = DEFAULT_TTL_S) {
  return { iss: issuerId, iat: now, exp: now + Math.min(ttlSeconds, ASC_MAX_TTL_S), aud: ASC_AUDIENCE };
}

export function signAscToken(creds: AscCredentials, now: number, ttlSeconds = DEFAULT_TTL_S): string {
  return signJwt({ alg: "ES256", kid: creds.keyId, typ: "JWT" }, ascClaims(creds.issuerId, now, ttlSeconds), creds.privateKey);
}

/** A token provider that signs a new token when the cached one has less than two minutes left. No network involved. */
export function createAscTokenProvider(creds: AscCredentials, now: () => number = Date.now): () => Promise<string> {
  let cached: { token: string; exp: number } | null = null;
  return async () => {
    const sec = Math.floor(now() / 1000);
    if (cached && cached.exp - 120 > sec) return cached.token;
    cached = { token: signAscToken(creds, sec), exp: sec + DEFAULT_TTL_S };
    return cached.token;
  };
}
