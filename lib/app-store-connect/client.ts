import { type FetchLike, fetchJson, StoreApiError } from "../api-http";
import type { PublishFieldKey, PublishFields } from "../publications";
import { AscConfigError, ascCredentials, createAscTokenProvider } from "./auth";

// App Store Connect API (JSON:API style). Endpoints checked on 2026-10-30 in the reference at
// https://developer.apple.com/documentation/appstoreconnectapi (JSON of each page):
//
//   GET   /v1/apps/{id}                                         (id = the App Store "Apple ID", our storeId)
//   GET   /v1/apps?filter[bundleId]=…                           (fallback by bundle id)
//   GET   /v1/apps/{id}/appStoreVersions?filter[platform]=IOS   (attributes versionString, appVersionState)
//   GET   /v1/appStoreVersions/{id}/appStoreVersionLocalizations?filter[locale]=…
//   PATCH /v1/appStoreVersionLocalizations/{id}                 description, keywords, promotionalText, whatsNew
//   GET   /v1/apps/{id}/appInfos                                (attribute state)
//   GET   /v1/appInfos/{id}/appInfoLocalizations?filter[locale]=…
//   PATCH /v1/appInfoLocalizations/{id}                         name, subtitle
//   GET   /v1/apps/{id}/analyticsReportRequests?include=reports (Analytics Reports API)
//   POST  /v1/analyticsReportRequests                           accessType ONGOING | ONE_TIME_SNAPSHOT
//
// Saving the texts does not submit the version for review: that stays in App Store Connect.

export const ASC_API = "https://api.appstoreconnect.apple.com";

/**
 * Version states where the metadata can be edited, from "App and submission statuses"
 * (https://developer.apple.com/help/app-store-connect/reference/app-and-submission-statuses, read on
 * 2026-10-30; the page marks them with icons, so the list follows its descriptions).
 */
export const EDITABLE_VERSION_STATES = ["PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"];
/** appInfo `state` values where name and subtitle can be edited. */
export const EDITABLE_APP_INFO_STATES = ["PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "DEVELOPER_REJECTED", "REJECTED"];

const VERSION_FIELDS: PublishFieldKey[] = ["description", "keywords", "promotionalText", "whatsNew"];
const INFO_FIELDS: PublishFieldKey[] = ["name", "subtitle"];

type Resource<A> = { id: string; type: string; attributes?: A };
type Doc<A> = { data: Resource<A> | Resource<A>[]; included?: Resource<Record<string, unknown>>[] };
type VersionAttrs = { versionString?: string; appVersionState?: string; appStoreState?: string; platform?: string };
type InfoAttrs = { state?: string; appStoreState?: string };
type VersionLocAttrs = { locale?: string; description?: string; keywords?: string; promotionalText?: string; whatsNew?: string };
type InfoLocAttrs = { locale?: string; name?: string; subtitle?: string };

export type AscVersion = { id: string; versionString: string; state: string };
export type AscAppInfo = { id: string; state: string };

/** URL of an App Store Connect resource with its query (the brackets of filter[...] are kept readable). */
export function ascUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const parts = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return `${ASC_API}${path}${parts.length ? `?${parts.join("&")}` : ""}`;
}

const list = <A>(doc: Doc<A> | null): Resource<A>[] => (doc ? (Array.isArray(doc.data) ? doc.data : [doc.data]) : []);

/** The version to edit: the first (newest) one in an editable state, or null. */
export function pickEditableVersion(versions: AscVersion[]): AscVersion | null {
  return versions.find((v) => EDITABLE_VERSION_STATES.includes(v.state)) ?? null;
}

export function pickEditableAppInfo(infos: AscAppInfo[]): AscAppInfo | null {
  return infos.find((i) => EDITABLE_APP_INFO_STATES.includes(i.state)) ?? null;
}

/** Splits the fields between the app info localization (name, subtitle) and the version localization (the rest). */
export function splitAscFields(fields: PublishFields): { info: PublishFields; version: PublishFields } {
  const pick = (keys: PublishFieldKey[]) => Object.fromEntries(keys.filter((k) => fields[k] !== undefined).map((k) => [k, fields[k]])) as PublishFields;
  return { info: pick(INFO_FIELDS), version: pick(VERSION_FIELDS) };
}

export const versionLocalizationPatchBody = (id: string, attributes: PublishFields) => ({
  data: { type: "appStoreVersionLocalizations", id, attributes },
});
export const appInfoLocalizationPatchBody = (id: string, attributes: PublishFields) => ({ data: { type: "appInfoLocalizations", id, attributes } });
export const analyticsRequestBody = (appId: string, accessType: "ONGOING" | "ONE_TIME_SNAPSHOT" = "ONGOING") => ({
  data: { type: "analyticsReportRequests", attributes: { accessType }, relationships: { app: { data: { type: "apps", id: appId } } } },
});

/** Spanish explanation of an App Store Connect error. */
export function explainAscError(status: number, apiMessage: string): string {
  const base =
    status === 401
      ? "App Store Connect rechazó la clave de API (revisa ASC_ISSUER_ID, ASC_KEY_ID y ASC_PRIVATE_KEY, y que el reloj del servidor esté en hora)."
      : status === 403
        ? "La clave de API no tiene permiso para esto: necesita el rol App Manager (o Admin para los informes de analítica)."
        : status === 404
          ? "App Store Connect no encuentra esta app con tu clave de API."
          : status === 409
            ? "App Store Connect no acepta el cambio en el estado actual de la versión."
            : status === 429
              ? "Se ha alcanzado el límite de peticiones de App Store Connect. Inténtalo en unos minutos."
              : status >= 500
                ? "App Store Connect no está respondiendo bien ahora mismo. Inténtalo de nuevo en unos minutos."
                : "App Store Connect rechazó la petición.";
  return apiMessage ? `${base} (${apiMessage})` : base;
}

export type AscListing = {
  appId: string;
  version: AscVersion;
  appInfo: AscAppInfo | null;
  versionLocalizationId: string;
  appInfoLocalizationId: string | null;
  /** What App Store Connect has now in the editable version, in the shape of the publish preview. */
  fields: PublishFields;
};

/** A problem that is not an API error: no version in preparation, the locale is not added… Spanish message. */
export class AscStateError extends Error {}

/** The first PATCH of saveListing went through and the second did not: `saved` fields are in App Store Connect. */
export class AscPartialSaveError extends Error {
  constructor(
    readonly saved: PublishFieldKey[],
    readonly failed: PublishFieldKey[],
    override readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

export type AscClient = ReturnType<typeof createAscClient>;

export function createAscClient(opts: { getToken: () => Promise<string>; fetch?: FetchLike }) {
  const fetchFn = opts.fetch ?? fetch;
  const call = async <T>(url: string, req: Parameters<typeof fetchJson>[2] = {}) =>
    fetchJson<T>(fetchFn, url, { ...req, headers: { Authorization: `Bearer ${await opts.getToken()}`, ...req.headers } }, explainAscError);
  const get = <A>(path: string, query?: Record<string, string | number | undefined>) => call<Doc<A>>(ascUrl(path, query), { retry: true });

  const api = {
    /** Read-only check of the key: lists at most one app of the account. Returns how many came back (0 or 1). */
    ping: async (): Promise<number> => list(await get("/v1/apps", { limit: 1 })).length,
    /** The app resource: by Apple ID (numeric storeId) and, if not found, by bundle id. */
    findApp: async (storeId: string, bundleId: string | null): Promise<string> => {
      if (/^\d+$/.test(storeId)) {
        try {
          const doc = await get(`/v1/apps/${storeId}`);
          const app = list(doc)[0];
          if (app) return app.id;
        } catch (err) {
          if (!(err instanceof StoreApiError && err.status === 404) || !bundleId) throw err;
        }
      }
      if (bundleId) {
        const app = list(await get("/v1/apps", { "filter[bundleId]": bundleId, limit: 1 }))[0];
        if (app) return app.id;
      }
      throw new AscStateError("Tu clave de App Store Connect no ve esta app: comprueba que la app es de tu cuenta.");
    },
    listVersions: async (appId: string): Promise<AscVersion[]> =>
      list(await get<VersionAttrs>(`/v1/apps/${appId}/appStoreVersions`, { "filter[platform]": "IOS", limit: 10 })).map((v) => ({
        id: v.id,
        versionString: v.attributes?.versionString ?? "",
        state: v.attributes?.appVersionState ?? v.attributes?.appStoreState ?? "",
      })),
    listAppInfos: async (appId: string): Promise<AscAppInfo[]> =>
      list(await get<InfoAttrs>(`/v1/apps/${appId}/appInfos`, { limit: 10 })).map((i) => ({
        id: i.id,
        state: i.attributes?.state ?? i.attributes?.appStoreState ?? "",
      })),
    getVersionLocalization: async (versionId: string, locale: string) =>
      list(await get<VersionLocAttrs>(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`, { "filter[locale]": locale }))[0] ?? null,
    getAppInfoLocalization: async (appInfoId: string, locale: string) =>
      list(await get<InfoLocAttrs>(`/v1/appInfos/${appInfoId}/appInfoLocalizations`, { "filter[locale]": locale }))[0] ?? null,
    updateVersionLocalization: (id: string, attributes: PublishFields) =>
      call(ascUrl(`/v1/appStoreVersionLocalizations/${id}`), { method: "PATCH", body: versionLocalizationPatchBody(id, attributes) }),
    updateAppInfoLocalization: (id: string, attributes: PublishFields) =>
      call(ascUrl(`/v1/appInfoLocalizations/${id}`), { method: "PATCH", body: appInfoLocalizationPatchBody(id, attributes) }),

    /** Analytics report requests of the app, with the reports Apple generated for each (read only). */
    listAnalyticsReportRequests: async (appId: string) => {
      const doc = await call<Doc<{ accessType?: string; stoppedDueToInactivity?: boolean }>>(
        ascUrl(`/v1/apps/${appId}/analyticsReportRequests`, { include: "reports", "limit[reports]": 50 }),
        { retry: true },
      );
      const reports = (doc?.included ?? []).filter((r) => r.type === "analyticsReports");
      return {
        requests: list(doc).map((r) => ({ id: r.id, accessType: r.attributes?.accessType ?? "", stopped: Boolean(r.attributes?.stoppedDueToInactivity) })),
        reports: reports.map((r) => ({ id: r.id, name: String(r.attributes?.name ?? ""), category: String(r.attributes?.category ?? "") })),
      };
    },
    createAnalyticsReportRequest: (appId: string) => call(ascUrl("/v1/analyticsReportRequests"), { method: "POST", body: analyticsRequestBody(appId) }),
  };

  return {
    ...api,
    /** The editable version and app info of a locale, and their current texts. Throws AscStateError when there is nothing to edit. */
    async readListing(storeId: string, bundleId: string | null, locale: string): Promise<AscListing> {
      const appId = await api.findApp(storeId, bundleId);
      const [versions, infos] = await Promise.all([api.listVersions(appId), api.listAppInfos(appId)]);
      const version = pickEditableVersion(versions);
      if (!version) {
        throw new AscStateError(
          "No hay ninguna versión en preparación. Crea la nueva versión en App Store Connect (botón «+» junto a iOS) y vuelve aquí: la versión publicada no se puede editar.",
        );
      }
      const appInfo = pickEditableAppInfo(infos);
      const [versionLoc, infoLoc] = await Promise.all([
        api.getVersionLocalization(version.id, locale),
        appInfo ? api.getAppInfoLocalization(appInfo.id, locale) : Promise.resolve(null),
      ]);
      if (!versionLoc) {
        throw new AscStateError(`La versión ${version.versionString} no tiene el idioma ${locale}. Añádelo primero en App Store Connect y vuelve aquí.`);
      }
      const v = versionLoc.attributes ?? {};
      const i = infoLoc?.attributes ?? {};
      return {
        appId,
        version,
        appInfo,
        versionLocalizationId: versionLoc.id,
        appInfoLocalizationId: infoLoc?.id ?? null,
        fields: {
          ...(infoLoc ? { name: i.name ?? "", subtitle: i.subtitle ?? "" } : {}),
          keywords: v.keywords ?? "",
          description: v.description ?? "",
          promotionalText: v.promotionalText ?? "",
          whatsNew: v.whatsNew ?? "",
        },
      };
    },
    /**
     * Saves the changed fields in the version in preparation: one PATCH for name/subtitle (app info) and
     * one for the rest (version), only when each has changes. Name and subtitle are skipped when the app
     * info cannot be edited (the caller shows that in the preview). When the second PATCH fails after the
     * first one saved its fields, throws AscPartialSaveError with both lists.
     */
    async saveListing(listing: AscListing, changed: PublishFields): Promise<{ saved: PublishFieldKey[] }> {
      const { info, version } = splitAscFields(changed);
      const steps: { keys: PublishFieldKey[]; run: () => Promise<unknown> }[] = [];
      if (Object.keys(info).length && listing.appInfoLocalizationId) {
        const id = listing.appInfoLocalizationId;
        steps.push({ keys: Object.keys(info) as PublishFieldKey[], run: () => api.updateAppInfoLocalization(id, info) });
      }
      if (Object.keys(version).length) {
        steps.push({ keys: Object.keys(version) as PublishFieldKey[], run: () => api.updateVersionLocalization(listing.versionLocalizationId, version) });
      }
      const saved: PublishFieldKey[] = [];
      for (const [i, step] of steps.entries()) {
        try {
          await step.run();
        } catch (err) {
          if (saved.length === 0) throw err;
          throw new AscPartialSaveError(saved, steps.slice(i).flatMap((s) => s.keys), err);
        }
        saved.push(...step.keys);
      }
      return { saved };
    },
  };
}

let shared: { key: string; client: AscClient } | null = null;

/** The client for this server's API key, or null when App Store Connect is not configured. */
export function getAscClient(env: Record<string, string | undefined> = process.env): AscClient | null {
  let creds;
  try {
    creds = ascCredentials(env);
  } catch {
    return null;
  }
  if (!creds) return null;
  const key = `${creds.issuerId}|${creds.keyId}|${creds.privateKey.length}`;
  if (shared?.key === key) return shared.client;
  shared = { key, client: createAscClient({ getToken: createAscTokenProvider(creds) }) };
  return shared.client;
}

export function ascErrorMessage(err: unknown): string {
  if (err instanceof AscPartialSaveError) return ascErrorMessage(err.cause);
  if (err instanceof StoreApiError || err instanceof AscStateError || err instanceof AscConfigError) return err.message;
  return "Error inesperado al hablar con App Store Connect.";
}
