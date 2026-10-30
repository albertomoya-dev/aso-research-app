import { createPrivateKey, createPublicKey, type KeyObject, sign, verify } from "node:crypto";

// Minimal JWT signing for the store APIs, with node:crypto and no extra dependency.
// Google service accounts sign with RS256; App Store Connect API keys with ES256. ES256 signatures in a
// JWT are the raw 64-byte r||s pair (RFC 7518 §3.4), not DER: hence dsaEncoding "ieee-p1363".

export type JwtAlg = "RS256" | "ES256";
export type JwtHeader = { alg: JwtAlg; typ: "JWT"; kid?: string };
export type JwtClaims = Record<string, unknown>;

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

/**
 * Private keys pasted into an environment variable often arrive with literal "\n", surrounding quotes
 * or Windows line breaks. Returns a PEM that node:crypto can read.
 */
export function normalizePem(raw: string): string {
  let pem = raw.trim();
  if ((pem.startsWith('"') && pem.endsWith('"')) || (pem.startsWith("'") && pem.endsWith("'"))) pem = pem.slice(1, -1);
  return pem.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim() + "\n";
}

export function toPrivateKey(pem: string | KeyObject): KeyObject {
  return typeof pem === "string" ? createPrivateKey(normalizePem(pem)) : pem;
}

export function signJwt(header: JwtHeader, claims: JwtClaims, privateKey: string | KeyObject): string {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = toPrivateKey(privateKey);
  const signature =
    header.alg === "ES256" ? sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" }) : sign("sha256", Buffer.from(input), key);
  return `${input}.${b64url(signature)}`;
}

/** Splits a JWT without checking it. Null when it is not three base64url JSON parts. */
export function decodeJwt(token: string): { header: JwtHeader; claims: JwtClaims } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")),
      claims: JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")),
    };
  } catch {
    return null;
  }
}

/** Checks the signature with a public key (or the private key it derives from). Used by the tests. */
export function verifyJwt(token: string, key: string | KeyObject): boolean {
  const decoded = decodeJwt(token);
  if (!decoded) return false;
  const [h, c, s] = token.split(".");
  const pub = typeof key === "string" ? createPublicKey(normalizePem(key)) : key.type === "private" ? createPublicKey(key) : key;
  const data = Buffer.from(`${h}.${c}`);
  const signature = Buffer.from(s, "base64url");
  return decoded.header.alg === "ES256"
    ? verify("sha256", data, { key: pub, dsaEncoding: "ieee-p1363" }, signature)
    : verify("sha256", data, pub, signature);
}
