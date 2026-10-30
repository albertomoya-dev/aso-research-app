import { type FetchLike, fetchJson, StoreApiError } from "../api-http";
import { createTokenProvider, parseServiceAccount, PlayConfigError } from "./auth";
import { PLAY_REPLY_LIMIT } from "./constants";

// Google Play Developer API (Android Publisher v3) over REST. Endpoints checked on 2026-10-30 against
// the API reference (https://developers.google.com/android-publisher/api-ref/rest/v3/...) and its
// discovery document (https://androidpublisher.googleapis.com/$discovery/rest?version=v3, revision 20261029):
//
//   edits.insert          POST   /applications/{pkg}/edits
//   edits.listings.get    GET    /applications/{pkg}/edits/{editId}/listings/{language}
//   edits.listings.patch  PATCH  /applications/{pkg}/edits/{editId}/listings/{language}
//   edits.validate        POST   /applications/{pkg}/edits/{editId}:validate
//   edits.commit          POST   /applications/{pkg}/edits/{editId}:commit?changesInReviewBehavior=…
//   edits.delete          DELETE /applications/{pkg}/edits/{editId}
//   reviews.list          GET    /applications/{pkg}/reviews?maxResults&token&translationLanguage
//   reviews.get           GET    /applications/{pkg}/reviews/{reviewId}
//   reviews.reply         POST   /applications/{pkg}/reviews/{reviewId}:reply   {replyText ≤ ~350 chars}
//
// We use listings.patch, not listings.update (PUT): update replaces the whole Listing and would clear
// the promo video URL, which Rankeo does not edit. The API has no endpoint for custom store listings.
// reviews.list only returns reviews created or modified in the last week ("Reply to Reviews" guide,
// https://developers.google.com/android-publisher/reply-to-reviews), with a quota of 200 GET per hour
// and 2000 POST per day per app.

export const PLAY_API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
export { PLAY_REPLY_LIMIT };

export type PlayListing = { language: string; title: string; shortDescription: string; fullDescription: string };
export type PlayListingFields = Omit<PlayListing, "language">;
export type PlayReview = {
  id: string;
  author: string;
  rating: number | null;
  text: string;
  /** Device language of the reviewer (not always the language of the text). */
  language: string | null;
  appVersion: string | null;
  lastModified: string | null;
  reply: { text: string; lastModified: string | null } | null;
};

type ApiTimestamp = { seconds?: string; nanos?: number };
type ApiReview = {
  reviewId: string;
  authorName?: string;
  comments?: {
    userComment?: { text?: string; starRating?: number; reviewerLanguage?: string; appVersionName?: string; lastModified?: ApiTimestamp };
    developerComment?: { text?: string; lastModified?: ApiTimestamp };
  }[];
};

const enc = encodeURIComponent;

/** URL of an Android Publisher resource: playUrl("com.app", "edits", id, "listings", "es-ES"). The ":commit" style verbs go in `verb`. */
export function playUrl(packageName: string, segments: string[], verb?: string, query?: Record<string, string | number | undefined>): string {
  const path = [enc(packageName), ...segments.map(enc)].join("/");
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") q.set(k, String(v));
  return `${PLAY_API}/applications/${path}${verb ? `:${verb}` : ""}${q.size ? `?${q}` : ""}`;
}

/** Body of listings.patch: only the three text fields Rankeo edits, trimmed. */
export function listingPatchBody(language: string, fields: PlayListingFields): PlayListing {
  return { language, title: fields.title.trim(), shortDescription: fields.shortDescription.trim(), fullDescription: fields.fullDescription.trim() };
}

/** Body of reviews.reply. Throws when empty or over Play's limit (the API would reject it). */
export function replyBody(text: string): { replyText: string } {
  const replyText = text.trim();
  if (!replyText) throw new StoreApiError("La respuesta está vacía.", 400);
  if ([...replyText].length > PLAY_REPLY_LIMIT) throw new StoreApiError(`La respuesta pasa de ${PLAY_REPLY_LIMIT} caracteres: Google Play la rechazaría.`, 400);
  return { replyText };
}

const isoOf = (t?: ApiTimestamp) => (t?.seconds ? new Date(Number(t.seconds) * 1000).toISOString() : null);

/** Flattens a review of reviews.list. Title and body come separated by a tab; they are joined with a line break. */
export function toPlayReview(r: ApiReview): PlayReview {
  const user = r.comments?.find((c) => c.userComment)?.userComment;
  const dev = r.comments?.find((c) => c.developerComment)?.developerComment;
  return {
    id: r.reviewId,
    author: r.authorName?.trim() || "Usuario de Google Play",
    rating: user?.starRating ?? null,
    text: (user?.text ?? "").replace(/\t/g, "\n").trim(),
    language: user?.reviewerLanguage ?? null,
    appVersion: user?.appVersionName ?? null,
    lastModified: isoOf(user?.lastModified),
    reply: dev?.text ? { text: dev.text, lastModified: isoOf(dev.lastModified) } : null,
  };
}

/** Spanish explanation of an Android Publisher error. */
export function explainPlayError(status: number, apiMessage: string): string {
  const base =
    status === 401
      ? "Google rechazó el token de la cuenta de servicio."
      : status === 403
        ? "La cuenta de servicio no tiene permiso sobre esta app: invítala en Play Console › Usuarios y permisos con permiso para editar la ficha y responder reseñas."
        : status === 404
          ? "Google Play no encuentra esta app o este idioma en tu cuenta de desarrollador."
          : status === 429
            ? "Se ha alcanzado la cuota de la API de Google Play. Inténtalo más tarde."
            : status >= 500
              ? "Google Play no está respondiendo bien ahora mismo. Inténtalo de nuevo en unos minutos."
              : "Google Play rechazó la petición.";
  return apiMessage ? `${base} (${apiMessage})` : base;
}

export type PlayClient = ReturnType<typeof createPlayClient>;

/** A client bound to a token provider. `fetch` is injectable for the tests. */
export function createPlayClient(opts: { getToken: () => Promise<string>; fetch?: FetchLike }) {
  const fetchFn = opts.fetch ?? fetch;
  const call = async <T>(url: string, req: Parameters<typeof fetchJson>[2] = {}) =>
    fetchJson<T>(fetchFn, url, { ...req, headers: { Authorization: `Bearer ${await opts.getToken()}`, ...req.headers } }, explainPlayError);

  const api = {
    /** Only asks Google for an access token: proves the service account is valid without reading or writing anything. */
    checkToken: async () => {
      await opts.getToken();
    },
    insertEdit: async (pkg: string) => {
      const edit = await call<{ id: string; expiryTimeSeconds?: string }>(playUrl(pkg, ["edits"]), { method: "POST", body: {} });
      if (!edit?.id) throw new StoreApiError("Google Play no devolvió el identificador de la edición.", 500);
      return edit;
    },
    /** Null when the app has no listing in that language yet. */
    getListing: async (pkg: string, editId: string, language: string): Promise<PlayListing | null> => {
      try {
        const l = await call<Partial<PlayListing>>(playUrl(pkg, ["edits", editId, "listings", language]), { retry: true });
        return { language, title: l?.title ?? "", shortDescription: l?.shortDescription ?? "", fullDescription: l?.fullDescription ?? "" };
      } catch (err) {
        if (err instanceof StoreApiError && err.status === 404) return null;
        throw err;
      }
    },
    patchListing: (pkg: string, editId: string, language: string, fields: PlayListingFields) =>
      call<PlayListing>(playUrl(pkg, ["edits", editId, "listings", language]), { method: "PATCH", body: listingPatchBody(language, fields) }),
    validateEdit: (pkg: string, editId: string) => call(playUrl(pkg, ["edits", editId], "validate"), { method: "POST" }),
    /** ERROR_IF_IN_REVIEW: never cancel changes already in Google's review (the API default would). */
    commitEdit: (pkg: string, editId: string) =>
      call(playUrl(pkg, ["edits", editId], "commit", { changesInReviewBehavior: "ERROR_IF_IN_REVIEW" }), { method: "POST" }),
    deleteEdit: (pkg: string, editId: string) => call(playUrl(pkg, ["edits", editId]), { method: "DELETE" }),

    listReviews: async (pkg: string, o: { maxResults?: number; token?: string; translationLanguage?: string } = {}) => {
      const res = await call<{ reviews?: ApiReview[]; tokenPagination?: { nextPageToken?: string } }>(
        playUrl(pkg, ["reviews"], undefined, { maxResults: o.maxResults ?? 50, token: o.token, translationLanguage: o.translationLanguage }),
        { retry: true },
      );
      return { reviews: (res?.reviews ?? []).map(toPlayReview), nextPageToken: res?.tokenPagination?.nextPageToken ?? null };
    },
    getReview: async (pkg: string, reviewId: string) => {
      const r = await call<ApiReview>(playUrl(pkg, ["reviews", reviewId]), { retry: true });
      if (!r?.reviewId) throw new StoreApiError("Google Play no encuentra esa reseña (solo se pueden leer las de la última semana).", 404);
      return toPlayReview(r);
    },
    replyToReview: async (pkg: string, reviewId: string, text: string) => {
      const res = await call<{ result?: { replyText?: string; lastEdited?: ApiTimestamp } }>(playUrl(pkg, ["reviews", reviewId], "reply"), {
        method: "POST",
        body: replyBody(text),
      });
      return { text: res?.result?.replyText ?? text.trim(), lastEdited: isoOf(res?.result?.lastEdited) };
    },
  };

  return {
    ...api,
    /** The live listing in one language: opens a temporary edit, reads it and deletes the edit. */
    async readListing(pkg: string, language: string): Promise<PlayListing | null> {
      const edit = await api.insertEdit(pkg);
      try {
        return await api.getListing(pkg, edit.id, language);
      } finally {
        await api.deleteEdit(pkg, edit.id).catch(() => {});
      }
    },
    /**
     * Publishes the three texts of one language: insert → read the current listing → patch → validate →
     * commit. If any step fails the edit is deleted, so nothing half-done stays in Play Console. Returns
     * the listing before and after (the commit sends it to Google's review, which can take hours).
     * When the live texts already match, nothing is committed and `unchanged` is true.
     */
    async publishListing(pkg: string, language: string, fields: PlayListingFields) {
      const edit = await api.insertEdit(pkg);
      let committed = false;
      try {
        const before = await api.getListing(pkg, edit.id, language);
        const body = listingPatchBody(language, fields);
        if (before && before.title.trim() === body.title && before.shortDescription.trim() === body.shortDescription && before.fullDescription.trim() === body.fullDescription) {
          return { editId: edit.id, before, after: before, unchanged: true };
        }
        const after = await api.patchListing(pkg, edit.id, language, fields);
        await api.validateEdit(pkg, edit.id);
        await api.commitEdit(pkg, edit.id);
        committed = true;
        return { editId: edit.id, before, after: after ?? body, unchanged: false };
      } finally {
        if (!committed) await api.deleteEdit(pkg, edit.id).catch(() => {});
      }
    },
  };
}

let shared: { raw: string; client: PlayClient } | null = null;

/**
 * The client for this server's credentials (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON), or null when the
 * integration is not configured. Reused across requests so the access token is cached.
 */
export function getPlayClient(env: Record<string, string | undefined> = process.env): PlayClient | null {
  const raw = env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  if (shared?.raw === raw) return shared.client;
  let sa;
  try {
    sa = parseServiceAccount(raw);
  } catch (err) {
    if (err instanceof PlayConfigError) return null;
    throw err;
  }
  shared = { raw, client: createPlayClient({ getToken: createTokenProvider(sa) }) };
  return shared.client;
}

/** Spanish message for any error of the Play integration. */
export function playErrorMessage(err: unknown): string {
  if (err instanceof StoreApiError || err instanceof PlayConfigError) return err.message;
  return "Error inesperado al hablar con Google Play.";
}
