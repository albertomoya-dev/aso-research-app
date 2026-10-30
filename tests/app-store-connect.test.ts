import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ASC_AUDIENCE,
  ASC_MAX_TTL_S,
  ascClaims,
  ascConfig,
  AscConfigError,
  ascCredentials,
  createAscTokenProvider,
  signAscToken,
} from "@/lib/app-store-connect/auth";
import {
  analyticsRequestBody,
  ASC_API,
  ascErrorMessage,
  AscPartialSaveError,
  AscStateError,
  ascUrl,
  createAscClient,
  explainAscError,
  pickEditableAppInfo,
  pickEditableVersion,
  splitAscFields,
  versionLocalizationPatchBody,
} from "@/lib/app-store-connect/client";
import { ASC_LOCALES, ascAlternatives, toAscLocale } from "@/lib/app-store-connect/locales";
import { ALL_LOCALES } from "@/lib/countries";
import { decodeJwt, verifyJwt } from "@/lib/jwt";
import { ascFieldsFromDraft, ascNextFields, buildPublishPreview } from "@/lib/publications";

// A P-256 key generated per run, like the .p8 files of App Store Connect: no real key in the repo.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const env = { ASC_ISSUER_ID: "57246542-96fe-1a63-e053-0824d011072a", ASC_KEY_ID: "2X9R4HXF34", ASC_PRIVATE_KEY: pem.replace(/\n/g, "\\n") };

describe("App Store Connect auth", () => {
  it("signs an ES256 token with the header and claims Apple documents", () => {
    const creds = ascCredentials(env)!;
    const token = signAscToken(creds, 1_800_000_000);
    expect(verifyJwt(token, publicKey)).toBe(true);
    const { header, claims } = decodeJwt(token)!;
    expect(header).toEqual({ alg: "ES256", kid: "2X9R4HXF34", typ: "JWT" });
    expect(claims).toEqual({ iss: env.ASC_ISSUER_ID, iat: 1_800_000_000, exp: 1_800_000_900, aud: ASC_AUDIENCE });
    // JWS ES256 signatures are the raw 64-byte r||s, not DER.
    expect(Buffer.from(token.split(".")[2], "base64url")).toHaveLength(64);
  });

  it("never asks for more than 20 minutes", () => {
    const claims = ascClaims("iss", 100, 3600);
    expect(claims.exp - claims.iat).toBe(ASC_MAX_TTL_S);
  });

  it("caches the token and signs a new one before it expires", async () => {
    let now = 1_800_000_000_000;
    const get = createAscTokenProvider(ascCredentials(env)!, () => now);
    const first = await get();
    now += 60_000;
    expect(await get()).toBe(first);
    now += 13 * 60_000;
    expect(await get()).not.toBe(first);
  });

  it("explains incomplete or wrong credentials and stays read-only by default", () => {
    expect(ascCredentials({})).toBeNull();
    expect(() => ascCredentials({ ASC_ISSUER_ID: "x" })).toThrow(AscConfigError);
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => ascCredentials({ ...env, ASC_PRIVATE_KEY: rsa })).toThrow(/\.p8/);
    expect(ascConfig(env)).toEqual({ configured: true, writeEnabled: false, error: null });
    expect(ascConfig({ ...env, ASC_ALLOW_WRITE: "1" }).writeEnabled).toBe(true);
    expect(ascConfig({ ...env, ASC_KEY_ID: "" }).configured).toBe(false);
  });
});

describe("App Store Connect locales", () => {
  it("maps Rankeo locales to Apple's shortcodes", () => {
    expect(toAscLocale("es-ES")?.code).toBe("es-ES");
    expect(toAscLocale("es-MX")?.code).toBe("es-MX");
    expect(toAscLocale("it-IT")?.code).toBe("it");
    expect(toAscLocale("ko-KR")?.code).toBe("ko");
    expect(toAscLocale("ja-JP")?.code).toBe("ja");
    expect(toAscLocale("he-IL")?.code).toBe("he");
    expect(toAscLocale("ar-AE")?.code).toBe("ar-SA");
    expect(toAscLocale("zh-TW")?.code).toBe("zh-Hant");
    expect(toAscLocale("zh-Hans")?.code).toBe("zh-Hans");
    expect(toAscLocale("ca")?.code).toBe("ca");
  });

  it("refuses storefront variants that show another localization", () => {
    expect(toAscLocale("es-AR")).toBeNull();
    expect(toAscLocale("en-NZ")).toBeNull();
    expect(toAscLocale("de-AT")).toBeNull();
    expect(ascAlternatives("es-AR")).toEqual(["es-MX", "es-ES"]);
    for (const locale of ALL_LOCALES) {
      const mapped = toAscLocale(locale);
      if (mapped) expect(ASC_LOCALES).toContain(mapped.code);
    }
  });
});

describe("App Store Connect request builders", () => {
  it("builds JSON:API bodies and readable filter URLs", () => {
    expect(ascUrl("/v1/apps", { "filter[bundleId]": "com.app", limit: 1 })).toBe(`${ASC_API}/v1/apps?filter[bundleId]=com.app&limit=1`);
    expect(versionLocalizationPatchBody("loc1", { keywords: "a,b" })).toEqual({
      data: { type: "appStoreVersionLocalizations", id: "loc1", attributes: { keywords: "a,b" } },
    });
    expect(analyticsRequestBody("123")).toEqual({
      data: { type: "analyticsReportRequests", attributes: { accessType: "ONGOING" }, relationships: { app: { data: { type: "apps", id: "123" } } } },
    });
    expect(splitAscFields({ name: "A", keywords: "k", whatsNew: "w" })).toEqual({ info: { name: "A" }, version: { keywords: "k", whatsNew: "w" } });
  });

  it("picks the version in preparation, never the live one", () => {
    expect(
      pickEditableVersion([
        { id: "v2", versionString: "2.0", state: "PREPARE_FOR_SUBMISSION" },
        { id: "v1", versionString: "1.9", state: "READY_FOR_DISTRIBUTION" },
      ])?.id,
    ).toBe("v2");
    expect(pickEditableVersion([{ id: "v1", versionString: "1.9", state: "READY_FOR_DISTRIBUTION" }])).toBeNull();
    expect(pickEditableAppInfo([{ id: "i1", state: "READY_FOR_DISTRIBUTION" }, { id: "i2", state: "PREPARE_FOR_SUBMISSION" }])?.id).toBe("i2");
    expect(explainAscError(401, "")).toMatch(/ASC_KEY_ID/);
  });
});

type Call = { method: string; url: string; body?: unknown };
function fakeAsc(routes: Record<string, (c: Call) => Response>) {
  const calls: Call[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    const c: Call = { method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const path = url.replace(ASC_API, "");
    const key = Object.keys(routes).find((k) => `${c.method} ${path}`.startsWith(k));
    return key ? routes[key](c) : new Response(JSON.stringify({ errors: [{ title: "Not found" }] }), { status: 404 });
  };
  return { calls, client: createAscClient({ getToken: async () => "jwt", fetch: fetchFn }) };
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const routes = {
  "GET /v1/apps/123/appStoreVersions": () =>
    json({ data: [{ id: "v2", type: "appStoreVersions", attributes: { versionString: "2.0", appVersionState: "PREPARE_FOR_SUBMISSION" } }] }),
  "GET /v1/apps/123/appInfos": () => json({ data: [{ id: "i2", type: "appInfos", attributes: { state: "PREPARE_FOR_SUBMISSION" } }] }),
  "GET /v1/apps/123": () => json({ data: { id: "123", type: "apps" } }),
  "GET /v1/appStoreVersions/v2/appStoreVersionLocalizations?filter[locale]=es-ES": () =>
    json({ data: [{ id: "vl", type: "appStoreVersionLocalizations", attributes: { locale: "es-ES", keywords: "pastillas", description: "Viejo", promotionalText: "", whatsNew: "" } }] }),
  "GET /v1/appInfos/i2/appInfoLocalizations?filter[locale]=es-ES": () =>
    json({ data: [{ id: "il", type: "appInfoLocalizations", attributes: { locale: "es-ES", name: "Recordatorio", subtitle: "Pastillas a tiempo" } }] }),
  "PATCH /v1/appInfoLocalizations/il": (c: Call) => json(c.body),
  "PATCH /v1/appStoreVersionLocalizations/vl": (c: Call) => json(c.body),
};

describe("App Store Connect client", () => {
  it("reads the editable version and app info of a locale", async () => {
    const { client } = fakeAsc(routes);
    const listing = await client.readListing("123", "com.app", "es-ES");
    expect(listing).toMatchObject({ appId: "123", version: { id: "v2", versionString: "2.0" }, versionLocalizationId: "vl", appInfoLocalizationId: "il" });
    expect(listing.fields).toEqual({ name: "Recordatorio", subtitle: "Pastillas a tiempo", keywords: "pastillas", description: "Viejo", promotionalText: "", whatsNew: "" });
  });

  it("saves only what changed, split between app info and version", async () => {
    const { calls, client } = fakeAsc(routes);
    const listing = await client.readListing("123", null, "es-ES");
    const draft = { title: "Recordatorio", subtitle: "", keywordField: "pastillas,alarma", shortDescription: "", description: "Nuevo" };
    const { fields, kept } = ascNextFields(draft, listing.fields, { whatsNew: "Escáner de códigos" }, true);
    // The empty subtitle of the draft (the public API never returns it) must not wipe the real one.
    expect(fields.subtitle).toBeUndefined();
    expect(kept[0]).toMatch(/Subtítulo/);
    const preview = buildPublishPreview("ios", listing.fields, fields);
    expect(preview.changes.map((c) => c.field)).toEqual(["keywords", "description", "whatsNew"]);
    const changed = Object.fromEntries(preview.changes.map((c) => [c.field, c.after]));
    expect((await client.saveListing(listing, changed)).saved).toEqual(["description", "keywords", "whatsNew"]);
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({
      data: { type: "appStoreVersionLocalizations", id: "vl", attributes: { keywords: "pastillas,alarma", description: "Nuevo", whatsNew: "Escáner de códigos" } },
    });
  });

  it("reports which fields were saved when only the first PATCH goes through", async () => {
    const { client } = fakeAsc({
      ...routes,
      "PATCH /v1/appStoreVersionLocalizations/vl": () => new Response(JSON.stringify({ errors: [{ detail: "Keywords too long" }] }), { status: 409 }),
    });
    const listing = await client.readListing("123", null, "es-ES");
    const err = await client.saveListing(listing, { name: "Recordatorio Pro", keywords: "pastillas,alarma" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AscPartialSaveError);
    expect((err as AscPartialSaveError).saved).toEqual(["name"]);
    expect((err as AscPartialSaveError).failed).toEqual(["keywords"]);
    expect(ascErrorMessage(err)).not.toBe("Error inesperado al hablar con App Store Connect.");
    // When the first PATCH fails nothing was saved: the plain error comes back.
    const first = fakeAsc({
      ...routes,
      "PATCH /v1/appInfoLocalizations/il": () => new Response(JSON.stringify({ errors: [{ detail: "Name taken" }] }), { status: 409 }),
    });
    const l2 = await first.client.readListing("123", null, "es-ES");
    const plain = await first.client.saveListing(l2, { name: "X", keywords: "y" }).catch((e: unknown) => e);
    expect(plain).not.toBeInstanceOf(AscPartialSaveError);
    expect(first.calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
  });

  it("says when there is no version in preparation or the locale is missing", async () => {
    const live = fakeAsc({
      ...routes,
      "GET /v1/apps/123/appStoreVersions": () =>
        json({ data: [{ id: "v1", type: "appStoreVersions", attributes: { versionString: "1.0", appVersionState: "READY_FOR_DISTRIBUTION" } }] }),
    });
    await expect(live.client.readListing("123", null, "es-ES")).rejects.toThrow(/versión en preparación/);
    const { client } = fakeAsc({
      ...routes,
      "GET /v1/appStoreVersions/v2/appStoreVersionLocalizations?filter[locale]=fr-FR": () => json({ data: [] }),
      "GET /v1/appInfos/i2/appInfoLocalizations?filter[locale]=fr-FR": () => json({ data: [] }),
    });
    await expect(client.readListing("123", null, "fr-FR")).rejects.toBeInstanceOf(AscStateError);
  });

  it("finds the app by bundle id when the Apple ID is not visible to the key", async () => {
    const { client } = fakeAsc({ "GET /v1/apps?filter[bundleId]=com.app": () => json({ data: [{ id: "999", type: "apps" }] }) });
    expect(await client.findApp("123", "com.app")).toBe("999");
  });

  it("lists analytics report requests and their reports", async () => {
    const { calls, client } = fakeAsc({
      "GET /v1/apps/123/analyticsReportRequests": () =>
        json({
          data: [{ id: "r1", type: "analyticsReportRequests", attributes: { accessType: "ONGOING", stoppedDueToInactivity: false } }],
          included: [{ id: "rep1", type: "analyticsReports", attributes: { name: "App Store Discovery and Engagement Standard", category: "APP_STORE_ENGAGEMENT" } }],
        }),
    });
    const res = await client.listAnalyticsReportRequests("123");
    expect(calls[0].url).toContain("include=reports");
    expect(res.requests).toEqual([{ id: "r1", accessType: "ONGOING", stopped: false }]);
    expect(res.reports[0]).toEqual({ id: "rep1", name: "App Store Discovery and Engagement Standard", category: "APP_STORE_ENGAGEMENT" });
  });
});

describe("App Store Connect fields", () => {
  const draft = { title: "Recordatorio", subtitle: "Pastillas a tiempo", keywordField: "k", shortDescription: "", description: "D" };

  it("sends the extras only when written, and drops name and subtitle when the app info is locked", () => {
    expect(ascFieldsFromDraft(draft, { promotionalText: "  " })).toEqual({ name: "Recordatorio", subtitle: "Pastillas a tiempo", keywords: "k", description: "D" });
    const { fields, kept } = ascNextFields(draft, { name: "Viejo", subtitle: "", keywords: "", description: "" }, {}, false);
    expect(fields).toEqual({ keywords: "k", description: "D" });
    expect(kept).toHaveLength(2);
  });

  it("checks Apple's limits, including the promotional text", () => {
    expect(buildPublishPreview("ios", null, { name: "a", promotionalText: "x".repeat(171) }).blockers).toEqual(["Texto promocional: 171 de 170 caracteres."]);
  });
});
