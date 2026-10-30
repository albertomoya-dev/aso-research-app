import type { Issue } from "./metadata-check";
import { MONTH_LONG, peakStarts } from "./seasonality";

// ASO health panel on each app's home (F12): one line per signal, with a status and a link to the screen
// where it is fixed. Pure: the page loads the data (lib/health-queries.ts) and these functions decide.

export type HealthStatus = "good" | "warn" | "bad" | "unknown";

export type HealthId = "coverage" | "irrelevant" | "listing-age" | "screenshots" | "policy" | "reviews" | "season";

export type HealthItem = {
  id: HealthId;
  label: string;
  status: HealthStatus;
  /** The short figure («62/100», «3 de 10»…). */
  value: string;
  /** One sentence: what it means and what to do. */
  hint: string;
  /** Where to act; null when there is nothing to do there. */
  href: string | null;
  /** Text of the link. */
  action: string | null;
};

/** Weighted coverage at or above this is good; below COVERAGE_WARN it is bad. */
export const COVERAGE_GOOD = 60;
export const COVERAGE_WARN = 35;
/** This many likely irrelevant keywords (or more) turns the line red. */
export const IRRELEVANT_BAD = 20;
/** Days before a seasonal peak when it becomes a warning: stores take 2–4 weeks to reindex. */
export const SEASON_WARN_DAYS = 35;
/** Unanswered reviews of the last week from which the line turns red. */
export const REVIEWS_BAD = 10;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Weighted keyword coverage (0–100) of the main draft or, without one, the published listing. */
export function coverageItem(input: { score: number | null; source: "draft" | "published"; keywords: number; href: string }): HealthItem {
  const base = { id: "coverage" as const, label: "Cobertura de keywords", href: input.href, action: "Abrir el editor de ficha" };
  if (input.keywords === 0 || input.score == null) {
    return { ...base, status: "unknown", value: "–", hint: "Aún no hay keywords relevantes con las que medir la ficha." };
  }
  const score = Math.round(input.score);
  const of = input.source === "draft" ? "tu borrador" : "la ficha publicada";
  const status: HealthStatus = score >= COVERAGE_GOOD ? "good" : score >= COVERAGE_WARN ? "warn" : "bad";
  const hint =
    status === "good"
      ? `${capitalize(of)} cubre bien tus keywords relevantes, ponderadas por oportunidad y por el campo donde están.`
      : `${capitalize(of)} deja fuera keywords con oportunidad o las tiene en campos que pesan poco. El editor muestra cuáles faltan.`;
  return { ...base, status, value: `${score}/100`, hint };
}

/** Likely irrelevant keywords still tracked, and the keyword budget. */
export function irrelevantItem(input: { irrelevant: number; total: number; budget: number; href: string }): HealthItem {
  const base = { id: "irrelevant" as const, label: "Keywords irrelevantes", action: "Revisar las irrelevantes" };
  const over = input.total > input.budget;
  if (input.total === 0) return { ...base, status: "unknown", value: "–", hint: "Aún no sigues keywords.", href: null, action: null };
  if (input.irrelevant === 0 && !over) {
    return { ...base, status: "good", value: "0", hint: `Ninguna keyword parece irrelevante (sigues ${input.total} de un máximo recomendado de ${input.budget}).`, href: null, action: null };
  }
  const status: HealthStatus = over || input.irrelevant >= IRRELEVANT_BAD ? "bad" : "warn";
  const hint = over
    ? `Sigues ${input.total} keywords, por encima de ${input.budget}: las alertas y la visibilidad pierden precisión. Quita primero las irrelevantes.`
    : `${plural(input.irrelevant, "keyword parece", "keywords parecen")} de otro tipo de app, de relevancia baja o palabras vacías. Revísalas antes de quitarlas.`;
  return { ...base, status, value: String(input.irrelevant), hint, href: input.href };
}

/** Compares dotted version strings numerically («1.10» > «1.9»). Non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-+]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(/[.\-+]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

const dayOf = (d: string | Date | null | undefined) => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
};

/**
 * The published listing against the product sheet: if the owner declared a release newer than the
 * version in the store (by version number or, without one, by date), the listing describes an older
 * version. Features marked «next release» are a reminder to prepare the next listing.
 */
export function listingAgeItem(input: {
  published: { version: string | null; updatedAt: string | null };
  latestRelease: { version: string; date: string | null } | null;
  nextFeatures: number;
  hasProduct: boolean;
  productHref: string;
  editorHref: string;
}): HealthItem {
  const base = { id: "listing-age" as const, label: "Ficha frente a tu producto" };
  if (!input.hasProduct && !input.latestRelease) {
    return {
      ...base,
      status: "unknown",
      value: "–",
      hint: "Rellena la ficha de producto (funciones y versiones) para saber si la ficha de la tienda está al día.",
      href: input.productHref,
      action: "Abrir Producto",
    };
  }
  const r = input.latestRelease;
  const storeDay = dayOf(input.published.updatedAt);
  const releaseDay = dayOf(r?.date);
  const newerByVersion = r && input.published.version ? compareVersions(r.version, input.published.version) > 0 : null;
  const newer = newerByVersion ?? (releaseDay != null && storeDay != null && releaseDay > storeDay);
  if (r && newer) {
    return {
      ...base,
      status: "bad",
      value: `v${r.version}`,
      hint: `Tu ficha describe una versión anterior: la tienda tiene ${input.published.version ? `la ${input.published.version}` : `la del ${storeDay}`} y tu producto ya va por la ${r.version}. Revisa los textos y las notas de la versión.`,
      href: input.editorHref,
      action: "Actualizar la ficha",
    };
  }
  if (input.nextFeatures > 0) {
    return {
      ...base,
      status: "warn",
      value: plural(input.nextFeatures, "novedad", "novedades"),
      hint: `${plural(input.nextFeatures, "función está marcada", "funciones están marcadas")} para la próxima versión: prepara el borrador y las notas antes de publicarla.`,
      href: input.editorHref,
      action: "Preparar el borrador",
    };
  }
  if (!r) {
    return {
      ...base,
      status: "unknown",
      value: "–",
      hint: "Tu ficha de producto no tiene versiones: añade la última (o importa el CHANGELOG) para compararla con la tienda.",
      href: input.productHref,
      action: "Añadir versiones",
    };
  }
  return {
    ...base,
    status: "good",
    value: input.published.version ? `v${input.published.version}` : "Al día",
    hint: "La ficha publicada corresponde a la última versión que tienes en la ficha de producto.",
    href: null,
    action: null,
  };
}

/** Uploaded screenshots older than the published listing (see `staleSlides`). */
export function screenshotsItem(input: { stale: number; uploaded: number; hasDesign: boolean; href: string }): HealthItem {
  const base = { id: "screenshots" as const, label: "Capturas", href: input.href };
  if (!input.hasDesign || input.uploaded === 0) {
    return {
      ...base,
      status: "unknown",
      value: "–",
      hint: "Sin capturas subidas en Creativos, no se puede saber si están al día (las de la tienda no tienen fecha).",
      action: "Abrir Creativos",
    };
  }
  if (input.stale === 0) return { ...base, status: "good", value: `${input.uploaded} al día`, hint: "Tus capturas son de la versión publicada.", href: null, action: null };
  return {
    ...base,
    status: input.stale === input.uploaded ? "bad" : "warn",
    value: `${input.stale} de ${input.uploaded}`,
    hint: `${plural(input.stale, "captura es anterior", "capturas son anteriores")} a la última actualización de la ficha o de otra versión: puede que enseñen pantallas que ya no existen.`,
    action: "Subir capturas nuevas",
  };
}

/** Store-policy issues of the main draft or the published listing (see `policyCheck`). */
export function policyItem(input: { issues: Issue[]; source: "draft" | "published"; href: string }): HealthItem {
  const errors = input.issues.filter((i) => i.level === "error").length;
  const warns = input.issues.filter((i) => i.level === "warn").length;
  const of = input.source === "draft" ? "tu borrador" : "la ficha publicada";
  const base = { id: "policy" as const, label: "Normas de las tiendas", href: input.href, action: "Ver los avisos en el editor" };
  if (errors > 0) {
    return { ...base, status: "bad", value: plural(errors, "error", "errores"), hint: `${capitalize(of)} incumple alguna norma de la tienda: puede retrasar la revisión o provocar un rechazo.` };
  }
  if (warns > 0) return { ...base, status: "warn", value: plural(warns, "aviso", "avisos"), hint: `${capitalize(of)} tiene avisos de normas (palabras promocionales, repeticiones…).` };
  return { ...base, status: "good", value: "Sin avisos", hint: `${capitalize(of)} pasa el comprobador de normas.`, href: null, action: null };
}

/**
 * Unanswered reviews of the last 7 days (Google Play Developer API). null = not readable: App Store
 * (no reviews API here yet), Play Console not connected, or the call failed (`error`).
 */
export function reviewsItem(input: {
  store: "ios" | "android";
  configured: boolean;
  unanswered: number | null;
  total?: number;
  error?: string | null;
  reviewsHref: string;
}): HealthItem {
  const base = { id: "reviews" as const, label: "Reseñas sin responder" };
  if (input.store === "ios") {
    return { ...base, status: "unknown", value: "–", hint: "Rankeo aún no lee las reseñas propias de App Store Connect; respóndelas desde la consola.", href: null, action: null };
  }
  if (!input.configured) {
    return { ...base, status: "unknown", value: "–", hint: "Conecta Google Play Console para ver las reseñas de la última semana sin responder.", href: "/ajustes", action: "Abrir Ajustes" };
  }
  if (input.unanswered == null) {
    return { ...base, status: "unknown", value: "–", hint: `No se pudieron leer las reseñas de Google Play${input.error ? `: ${input.error}` : "."}`, href: "/ajustes", action: "Probar la conexión" };
  }
  if (input.unanswered === 0) {
    return { ...base, status: "good", value: "0", hint: input.total ? "Has respondido todas las reseñas de la última semana." : "No hay reseñas nuevas en la última semana.", href: null, action: null };
  }
  return {
    ...base,
    status: input.unanswered >= REVIEWS_BAD ? "bad" : "warn",
    value: String(input.unanswered),
    hint: `${plural(input.unanswered, "reseña", "reseñas")} de la última semana sin respuesta. La API solo deja responder las de los últimos 7 días.`,
    href: input.reviewsHref,
    action: "Responder reseñas",
  };
}

export type KeywordPeaks = { term: string; peaks: number[] };
export type NextSeason = { term: string; month: number; days: number; running: boolean };

/**
 * The nearest seasonal peak among keywords that may be announced: one that is running now (the current
 * month is a peak) counts as 0 days; otherwise the first day of the next peak start. `date` is YYYY-MM-DD.
 */
export function nextSeason(keywords: KeywordPeaks[], date: string): NextSeason | null {
  const today = new Date(`${date}T00:00:00Z`);
  const month = today.getUTCMonth();
  let best: NextSeason | null = null;
  for (const k of keywords) {
    if (k.peaks.length === 0) continue;
    let candidate: NextSeason;
    if (k.peaks.includes(month)) {
      candidate = { term: k.term, month, days: 0, running: true };
    } else {
      const starts = peakStarts(k.peaks);
      let soonest = Infinity;
      let soonestMonth = starts[0];
      for (const m of starts) {
        const year = m > month ? today.getUTCFullYear() : today.getUTCFullYear() + 1;
        const days = Math.round((Date.UTC(year, m, 1) - today.getTime()) / 86_400_000);
        if (days < soonest) [soonest, soonestMonth] = [days, m];
      }
      if (!Number.isFinite(soonest)) continue;
      candidate = { term: k.term, month: soonestMonth, days: soonest, running: false };
    }
    if (!best || candidate.days < best.days) best = candidate;
  }
  return best;
}

export function seasonItem(input: { next: NextSeason | null; analysed: number; href: string }): HealthItem {
  const base = { id: "season" as const, label: "Próximo pico estacional", href: input.href, action: "Ver el calendario" };
  if (!input.next) {
    return {
      ...base,
      status: "unknown",
      value: "–",
      hint:
        input.analysed === 0
          ? "Aún no hay datos de Google Trends para tus keywords (se descargan en la consulta diaria)."
          : "Ninguna keyword relevante y con búsquedas en la tienda tiene un pico claro.",
    };
  }
  const { term, month, days, running } = input.next;
  if (running) {
    return { ...base, status: "warn", value: `${capitalize(MONTH_LONG[month])}, ahora`, hint: `«${term}» está en temporada este mes: comprueba que la ficha la cubre.` };
  }
  const soon = days <= SEASON_WARN_DAYS;
  return {
    ...base,
    status: soon ? "warn" : "good",
    value: `${capitalize(MONTH_LONG[month])}, en ${plural(days, "día", "días")}`,
    hint: soon
      ? `El pico de «${term}» empieza pronto. Las tiendas tardan de 2 a 4 semanas en reindexar: prepara ya la ficha.`
      : `El siguiente pico es el de «${term}». Hay margen; empieza a prepararlo unas 4 semanas antes.`,
  };
}

/** Counts per status, for the panel's summary line. */
export function healthSummary(items: HealthItem[]): Record<HealthStatus, number> {
  const out: Record<HealthStatus, number> = { good: 0, warn: 0, bad: 0, unknown: 0 };
  for (const i of items) out[i.status]++;
  return out;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
