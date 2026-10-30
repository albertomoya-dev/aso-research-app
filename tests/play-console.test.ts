import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StoreApiError } from "@/lib/api-http";
import { decodeJwt, normalizePem, verifyJwt } from "@/lib/jwt";
import { ALL_LOCALES } from "@/lib/countries";
import {
  assertionClaims,
  createTokenProvider,
  GOOGLE_TOKEN_URL,
  JWT_BEARER_GRANT,
  parseServiceAccount,
  PLAY_SCOPE,
  PlayConfigError,
  playConfig,
  signAssertion,
} from "@/lib/play-console/auth";
import { createPlayClient, explainPlayError, listingPatchBody, PLAY_API, playUrl, replyBody, toPlayReview } from "@/lib/play-console/client";
import { classifyHeader, CsvFormatError, decodeCsv, parseCount, parseCsv, parseDate, parseSearchTermsCsv } from "@/lib/play-console/csv";
import { PLAY_LANGUAGES, playAlternatives, toPlayLanguage } from "@/lib/play-console/locales";
import { buildPublishPreview, fieldList, playFieldsFromDraft, publishedFields } from "@/lib/publications";
import { buildReviewReplyPrompt, fitReply, REVIEW_REPLY_PROMPT_VERSION } from "@/lib/review-replies";
import { officialStats, PeriodRequiredError, statRowsFrom, untrackedTopTerms } from "@/lib/search-terms";

// Generated per run: no real key in the repo.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const saJson = JSON.stringify({ type: "service_account", client_email: "rankeo@proj.iam.gserviceaccount.com", private_key: pem, private_key_id: "kid123" });

describe("service account auth", () => {
  it("reads the key as JSON or base64 and never echoes it in errors", () => {
    expect(parseServiceAccount(saJson).clientEmail).toBe("rankeo@proj.iam.gserviceaccount.com");
    expect(parseServiceAccount(Buffer.from(saJson).toString("base64")).privateKeyId).toBe("kid123");
    expect(() => parseServiceAccount("not json")).toThrow(PlayConfigError);
    try {
      parseServiceAccount(JSON.stringify({ type: "service_account", client_email: "x@y" }));
    } catch (err) {
      expect((err as Error).message).not.toContain("BEGIN");
    }
  });

  it("signs an RS256 assertion with the claims Google expects", () => {
    const sa = parseServiceAccount(saJson);
    const token = signAssertion(sa, 1_800_000_000);
    expect(verifyJwt(token, publicKey)).toBe(true);
    const { header, claims } = decodeJwt(token)!;
    expect(header).toEqual({ alg: "RS256", typ: "JWT", kid: "kid123" });
    expect(claims).toEqual(assertionClaims(sa, 1_800_000_000));
    expect(claims).toMatchObject({ iss: sa.clientEmail, scope: PLAY_SCOPE, aud: GOOGLE_TOKEN_URL, exp: 1_800_003_600 });
  });

  it("accepts a PEM pasted with escaped line breaks", () => {
    const escaped = `"${pem.replace(/\n/g, "\\n")}"`;
    expect(normalizePem(escaped)).toBe(pem.trim() + "\n");
  });

  it("exchanges the assertion for a token once and caches it until it is about to expire", async () => {
    let now = 1_800_000_000_000;
    const calls: { url: string; body: string }[] = [];
    const fakeFetch = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body) });
      return new Response(JSON.stringify({ access_token: `tok${calls.length}`, expires_in: 3600 }), { status: 200 });
    };
    const getToken = createTokenProvider(parseServiceAccount(saJson), { fetch: fakeFetch, now: () => now });
    expect(await getToken()).toBe("tok1");
    expect(await getToken()).toBe("tok1");
    expect(calls).toHaveLength(1);
    const form = new URLSearchParams(calls[0].body);
    expect(calls[0].url).toBe(GOOGLE_TOKEN_URL);
    expect(form.get("grant_type")).toBe(JWT_BEARER_GRANT);
    expect(verifyJwt(form.get("assertion")!, publicKey)).toBe(true);
    now += 3600_000 - 30_000;
    expect(await getToken()).toBe("tok2");
  });

  it("explains a rejected key without the secret", async () => {
    const fakeFetch = async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid JWT Signature." }), { status: 400 });
    const getToken = createTokenProvider(parseServiceAccount(saJson), { fetch: fakeFetch });
    await expect(getToken()).rejects.toThrow(/invalid_grant/);
  });

  it("is read-only unless GOOGLE_PLAY_ALLOW_WRITE=1", () => {
    expect(playConfig({})).toEqual({ configured: false, writeEnabled: false, error: null });
    expect(playConfig({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: saJson })).toMatchObject({ configured: true, writeEnabled: false });
    expect(playConfig({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: saJson, GOOGLE_PLAY_ALLOW_WRITE: "1" }).writeEnabled).toBe(true);
    expect(playConfig({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: "{bad" }).configured).toBe(false);
  });
});

describe("Play language codes", () => {
  it("maps Rankeo locales to Play's codes", () => {
    expect(toPlayLanguage("es-ES")?.code).toBe("es-ES");
    expect(toPlayLanguage("es-MX")?.code).toBe("es-419");
    expect(toPlayLanguage("es-AR")?.code).toBe("es-419");
    expect(toPlayLanguage("en-US")?.code).toBe("en-US");
    expect(toPlayLanguage("pt-BR")?.code).toBe("pt-BR");
    expect(toPlayLanguage("he-IL")?.code).toBe("iw-IL");
    expect(toPlayLanguage("zh-Hans")?.code).toBe("zh-CN");
    expect(toPlayLanguage("zh-Hant")?.code).toBe("zh-TW");
    expect(toPlayLanguage("ar-SA")?.code).toBe("ar");
    expect(toPlayLanguage("ro-RO")?.code).toBe("ro");
    expect(toPlayLanguage("ko")?.code).toBe("ko-KR");
    expect(toPlayLanguage("ca")?.code).toBe("ca");
  });

  it("refuses variants Play does not have instead of overwriting another listing", () => {
    expect(toPlayLanguage("en-NZ")).toBeNull();
    expect(toPlayLanguage("de-AT")).toBeNull();
    expect(toPlayLanguage("fr-BE")).toBeNull();
    expect(playAlternatives("en-NZ")).toEqual(expect.arrayContaining(["en-AU", "en-GB"]));
  });

  it("only ever returns supported codes", () => {
    for (const locale of ALL_LOCALES) {
      const mapped = toPlayLanguage(locale);
      if (mapped) expect(PLAY_LANGUAGES).toContain(mapped.code);
    }
  });
});

type Call = { method: string; url: string; body?: unknown; auth?: string };
function fakePlay(handlers: Record<string, (c: Call) => Response>) {
  const calls: Call[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: (init?.headers as Record<string, string>)?.Authorization,
    };
    calls.push(call);
    const path = url.replace(PLAY_API, "").replace(/\?.*$/, "");
    const key = Object.keys(handlers).find((k) => {
      const [m, p] = k.split(" ");
      return m === call.method && new RegExp(`^${p}$`).test(path);
    });
    return key ? handlers[key](call) : new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 });
  };
  return { calls, client: createPlayClient({ getToken: async () => "tok", fetch: fetchFn }) };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const live = { language: "es-ES", title: "Recordatorio", shortDescription: "Pastillas", fullDescription: "Texto", video: "https://youtu.be/x" };
const pkg = "com.moyalogames.recordatorio";

describe("Play client", () => {
  it("builds the REST URLs of the reference", () => {
    expect(playUrl(pkg, ["edits", "e1"], "commit", { changesInReviewBehavior: "ERROR_IF_IN_REVIEW" })).toBe(
      `${PLAY_API}/applications/${pkg}/edits/e1:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`,
    );
    expect(playUrl(pkg, ["edits", "e1", "listings", "es-419"])).toBe(`${PLAY_API}/applications/${pkg}/edits/e1/listings/es-419`);
  });

  it("publishes with insert → get → patch → validate → commit and never sends the video", async () => {
    const { calls, client } = fakePlay({
      "POST /applications/[^/]+/edits": () => json({ id: "e1" }),
      "GET /applications/[^/]+/edits/e1/listings/es-ES": () => json(live),
      "PATCH /applications/[^/]+/edits/e1/listings/es-ES": (c) => json(c.body),
      "POST /applications/[^/]+/edits/e1:validate": () => json({ id: "e1" }),
      "POST /applications/[^/]+/edits/e1:commit": () => json({ id: "e1" }),
    });
    const result = await client.publishListing(pkg, "es-ES", { title: "Recordatorio pastillas", shortDescription: "Pastillas", fullDescription: "Texto" });
    expect(calls.map((c) => `${c.method} ${c.url.split("/edits")[1] ?? ""}`)).toEqual([
      "POST ",
      "GET /e1/listings/es-ES",
      "PATCH /e1/listings/es-ES",
      "POST /e1:validate",
      "POST /e1:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW",
    ]);
    expect(calls[2].body).toEqual({ language: "es-ES", title: "Recordatorio pastillas", shortDescription: "Pastillas", fullDescription: "Texto" });
    expect(calls.every((c) => c.auth === "Bearer tok")).toBe(true);
    expect(result).toMatchObject({ editId: "e1", unchanged: false, before: { title: "Recordatorio" } });
  });

  it("creates the listing with update (PUT) when the language has none yet", async () => {
    const { calls, client } = fakePlay({
      "POST /applications/[^/]+/edits": () => json({ id: "e5" }),
      "PUT /applications/[^/]+/edits/e5/listings/fr-FR": (c) => json(c.body),
      "POST /applications/[^/]+/edits/e5:validate": () => json({ id: "e5" }),
      "POST /applications/[^/]+/edits/e5:commit": () => json({ id: "e5" }),
    });
    const result = await client.publishListing(pkg, "fr-FR", { title: "Rappel", shortDescription: "Pilules", fullDescription: "Texte" });
    expect(calls.map((c) => `${c.method} ${c.url.split("/edits")[1] ?? ""}`)).toEqual([
      "POST ",
      "GET /e5/listings/fr-FR",
      "PUT /e5/listings/fr-FR",
      "POST /e5:validate",
      "POST /e5:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW",
    ]);
    expect(result).toMatchObject({ before: null, unchanged: false });
  });

  it("deletes the edit when a step fails, so nothing half-done stays in Play Console", async () => {
    const { calls, client } = fakePlay({
      "POST /applications/[^/]+/edits": () => json({ id: "e2" }),
      "GET /applications/[^/]+/edits/e2/listings/es-ES": () => json(live),
      "PATCH /applications/[^/]+/edits/e2/listings/es-ES": (c) => json(c.body),
      "POST /applications/[^/]+/edits/e2:validate": () => json({ error: { message: "Title too long" } }, 400),
      "DELETE /applications/[^/]+/edits/e2": () => new Response("", { status: 204 }),
    });
    await expect(client.publishListing(pkg, "es-ES", { title: "x", shortDescription: "y", fullDescription: "z" })).rejects.toThrow(/Title too long/);
    expect(calls.at(-1)?.method).toBe("DELETE");
    expect(calls.some((c) => c.url.includes(":commit"))).toBe(false);
  });

  it("does not commit when the live listing already has the text", async () => {
    const { calls, client } = fakePlay({
      "POST /applications/[^/]+/edits": () => json({ id: "e3" }),
      "GET /applications/[^/]+/edits/e3/listings/es-ES": () => json(live),
      "DELETE /applications/[^/]+/edits/e3": () => new Response("", { status: 204 }),
    });
    const r = await client.publishListing(pkg, "es-ES", { title: "Recordatorio ", shortDescription: "Pastillas", fullDescription: "Texto" });
    expect(r.unchanged).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["POST", "GET", "DELETE"]);
  });

  it("reads the live listing in a temporary edit, and a missing language is null", async () => {
    const { calls, client } = fakePlay({
      "POST /applications/[^/]+/edits": () => json({ id: "e4" }),
      "DELETE /applications/[^/]+/edits/e4": () => new Response("", { status: 204 }),
    });
    expect(await client.readListing(pkg, "fr-FR")).toBeNull();
    expect(calls.at(-1)?.method).toBe("DELETE");
  });

  it("lists reviews and replies within Play's limit", async () => {
    const { calls, client } = fakePlay({
      "GET /applications/[^/]+/reviews": () =>
        json({
          reviews: [
            {
              reviewId: "r1",
              authorName: "Ana",
              comments: [
                { userComment: { text: "Título\tNo suena la alarma", starRating: 2, reviewerLanguage: "es", lastModified: { seconds: "1800000000" } } },
                { developerComment: { text: "Gracias", lastModified: { seconds: "1800000100" } } },
              ],
            },
          ],
          tokenPagination: { nextPageToken: "n" },
        }),
      "POST /applications/[^/]+/reviews/r1:reply": (c) => json({ result: { replyText: (c.body as { replyText: string }).replyText } }),
    });
    const { reviews, nextPageToken } = await client.listReviews(pkg, { maxResults: 10 });
    expect(new URL(calls[0].url).searchParams.get("maxResults")).toBe("10");
    expect(nextPageToken).toBe("n");
    expect(reviews[0]).toMatchObject({ id: "r1", rating: 2, text: "Título\nNo suena la alarma", reply: { text: "Gracias" } });
    expect(reviews[0].lastModified).toBe(new Date(1_800_000_000_000).toISOString());
    expect((await client.replyToReview(pkg, "r1", " Hola ")).text).toBe("Hola");
    expect(() => replyBody("a".repeat(351))).toThrow(StoreApiError);
    expect(() => replyBody("  ")).toThrow(StoreApiError);
  });

  it("explains permission errors in Spanish", () => {
    expect(explainPlayError(403, "The caller does not have permission")).toMatch(/Usuarios y permisos.*The caller/);
    expect(toPlayReview({ reviewId: "x" }).author).toBe("Usuario de Google Play");
    expect(listingPatchBody("es-ES", { title: " a ", shortDescription: "b", fullDescription: "c" }).title).toBe("a");
  });
});

const utf16 = (text: string) => new Uint8Array([0xff, 0xfe, ...Buffer.from(text, "utf16le")]);
const utf8bom = (text: string) => new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from(text, "utf8")]);

describe("Play Console search terms CSV", () => {
  it("reads the Cloud Storage traffic source report (UTF-16, one row per day)", () => {
    const csv = [
      "Date,Package name,Traffic source,Search term,UTM source,UTM campaign,Store listing acquisitions,Store listing visitors,Store listing conversion rate",
      "2026-09-01,com.app,Google Play search,recordatorio pastillas,,,12,140,0.0857",
      "2026-09-01,com.app,Google Play search,Recordatorio  Pastillas,,,1,10,0.1",
      "2026-09-01,com.app,Google Play search,Other,,,3,50,0.06",
      "2026-09-01,com.app,Google Play explore,,,,4,90,0.04",
      '2026-09-02,com.app,Google Play search,"pastillero, alarma",,,2,30,0.0667',
    ].join("\r\n");
    const parsed = parseSearchTermsCsv(utf16(csv));
    expect(parsed.hasDates).toBe(true);
    expect(parsed.from).toBe("2026-09-01");
    expect(parsed.to).toBe("2026-09-02");
    expect(parsed.skipped).toBe(2);
    expect(parsed.rows).toEqual([
      { date: "2026-09-01", term: "recordatorio pastillas", visitors: 150, acquisitions: 13 },
      { date: "2026-09-02", term: "pastillero, alarma", visitors: 30, acquisitions: 2 },
    ]);
  });

  it("reads a Spanish console export (UTF-8 with BOM, semicolons, a title line, thousands separators)", () => {
    const csv = [
      "Términos de búsqueda · Últimos 30 días",
      "Término de búsqueda;Visitantes de la ficha de Play Store;Adquisiciones de la ficha de Play Store;Tasa de conversión",
      "pastillero;1.234;56;4,5 %",
      "otros;99;1;1 %",
    ].join("\n");
    const parsed = parseSearchTermsCsv(utf8bom(csv));
    expect(parsed.hasDates).toBe(false);
    expect(parsed.rows).toEqual([{ date: null, term: "pastillero", visitors: 1234, acquisitions: 56 }]);
    expect(() => statRowsFrom(parsed, null)).toThrow(PeriodRequiredError);
    expect(statRowsFrom(parsed, { start: "2026-09-01", end: "2026-09-30" })).toEqual([
      { term: "pastillero", periodStart: "2026-09-01", periodEnd: "2026-09-30", visitors: 1234, acquisitions: 56 },
    ]);
  });

  it("decodes UTF-16 without BOM and rejects files without the needed columns", () => {
    expect(decodeCsv(new Uint8Array(Buffer.from("Search term,Store listing visitors\nabc,1", "utf16le")))).toContain("Search term");
    expect(() => parseSearchTermsCsv(utf8bom("Date,Country,Installs\n2026-09-01,ES,4"))).toThrow(CsvFormatError);
  });

  it("parses cells, numbers, dates and headers", () => {
    expect(parseCsv('a,"b ""c"", d"\n\n1,2')).toEqual([["a", 'b "c", d'], ["1", "2"]]);
    expect(parseCount("1 234")).toBe(1234);
    expect(parseCount("-")).toBe(0);
    expect(parseDate("2026-09-01")).toBe("2026-09-01");
    expect(parseDate("01/09/2026")).toBe("2026-09-01");
    expect(parseDate("20260901")).toBe("2026-09-01");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(classifyHeader("Store listing conversion rate")).toBeNull();
    expect(classifyHeader("Store listing visitors")).toBe("visitors");
    expect(classifyHeader("Installers")).toBe("acquisitions");
    expect(classifyHeader("Traffic source")).toBeNull();
  });
});

describe("official search term figures", () => {
  const day = (d: string, term: string, visitors: number, acquisitions = 0) => ({ term, periodStart: d, periodEnd: d, visitors, acquisitions });

  it("sums the last 30 days of daily data", () => {
    const stats = officialStats([day("2026-08-01", "a", 100), day("2026-09-01", "a", 10, 1), day("2026-09-30", "a", 5, 1), day("2026-09-15", "b", 7)]);
    expect(stats?.from).toBe("2026-09-01");
    expect(stats?.to).toBe("2026-09-30");
    expect(stats?.byTerm.get("a")).toEqual({ visitors: 15, acquisitions: 2 });
  });

  it("uses a longer export as it is, without mixing older overlapping exports", () => {
    const stats = officialStats([
      { term: "a", periodStart: "2026-07-01", periodEnd: "2026-09-28", visitors: 900, acquisitions: 90 },
      { term: "a", periodStart: "2026-06-01", periodEnd: "2026-08-29", visitors: 500, acquisitions: 50 },
    ]);
    expect(stats).toMatchObject({ from: "2026-07-01", to: "2026-09-28" });
    expect(stats?.byTerm.get("a")?.visitors).toBe(900);
    expect(officialStats([])).toBeNull();
  });

  it("lists the searches that bring visitors and are not followed", () => {
    const stats = officialStats([day("2026-09-01", "a", 1), day("2026-09-01", "b", 9), day("2026-09-01", "c", 5)]);
    expect(untrackedTopTerms(stats, new Set(["b"])).map((t) => t.term)).toEqual(["c", "a"]);
  });
});

describe("publish preview", () => {
  const draft = { title: "Recordatorio pastillas", subtitle: "", keywordField: "", shortDescription: "Pastillas", description: "Texto" };

  it("shows only what changes, with the store limits", () => {
    const preview = buildPublishPreview("android", { title: "Recordatorio", shortDescription: "Pastillas", fullDescription: "Viejo" }, playFieldsFromDraft(draft));
    expect(preview.changes.map((c) => c.field)).toEqual(["title", "fullDescription"]);
    expect(preview.unchanged).toEqual(["Descripción corta"]);
    expect(preview.blockers).toEqual([]);
    expect(publishedFields(preview.changes)[0]).toEqual({ field: "title", label: "Título", before: "Recordatorio", after: "Recordatorio pastillas" });
    expect(fieldList(preview.changes.map((c) => c.label))).toBe("Título y Descripción");
  });

  it("blocks texts over the limit and an empty title; a new language compares against empty", () => {
    const preview = buildPublishPreview("android", null, { title: "", shortDescription: "x".repeat(81), fullDescription: "" });
    expect(preview.blockers).toHaveLength(2);
    expect(preview.changes.map((c) => c.field)).toEqual(["shortDescription"]);
  });
});

describe("review reply drafts", () => {
  it("keeps replies under Play's 350 characters", () => {
    const long = `${"Gracias por tu reseña. ".repeat(14)}Lo arreglamos en la próxima versión, que saldrá muy pronto para todos los usuarios de la app.`;
    const fitted = fitReply(long);
    expect(fitted.cut).toBe(true);
    expect([...fitted.text].length).toBeLessThanOrEqual(350);
    expect(fitted.text.endsWith(".")).toBe(true);
    expect(fitReply("Gracias.")).toEqual({ text: "Gracias.", cut: false });
  });

  it("gives the model the review, the facts and the limit", () => {
    const prompt = buildReviewReplyPrompt({
      appTitle: "Recordatorio",
      review: { text: "No suena la alarma", rating: 2, language: "es", appVersion: "2.4.0" },
      currentReply: null,
      facts: "PRODUCT FACTS:\nBrand tone: Cercano",
    });
    expect(prompt).toContain("2/5 stars");
    expect(prompt).toContain("Brand tone: Cercano");
    expect(prompt).toContain("max 350");
    expect(REVIEW_REPLY_PROMPT_VERSION).toBe("rr-1");
  });
});
