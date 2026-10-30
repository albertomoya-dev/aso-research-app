import { formatDate } from "@/lib/format";
import { playConfig } from "@/lib/play-console/auth";
import { getPlayClient, playErrorMessage, type PlayReview } from "@/lib/play-console/client";
import { ReviewReplyForm } from "./review-reply-form";
import { Card, ErrorNote } from "./ui";

/**
 * The app's own latest reviews read from the Google Play Developer API (official data, last 7 days only),
 * with an AI-drafted reply for each. Rendered inside a Suspense boundary: it waits for Google.
 */
export async function PlayReviews({ appId, packageName, aiEnabled }: { appId: number; packageName: string; aiEnabled: boolean }) {
  const config = playConfig();
  const client = getPlayClient();
  if (!config.configured || !client) return null;
  let reviews: PlayReview[] = [];
  let error: string | null = null;
  try {
    reviews = (await client.listReviews(packageName, { maxResults: 30 })).reviews;
  } catch (err) {
    error = playErrorMessage(err);
  }
  const unanswered = reviews.filter((r) => !r.reply).length;

  return (
    <Card aria-label="Reseñas de Google Play Console" className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-[15px] font-semibold">Responder reseñas</h2>
          <span className="rounded-md border border-line-strong px-2 py-0.5 text-xs font-semibold text-ink-soft">Dato oficial · Play Console</span>
        </div>
        <p className="mt-1 text-[13px] text-muted">
          Reseñas de tu app escritas o editadas en los últimos 7 días (la API de Google Play no da más), en todos los países.
          {reviews.length > 0 && ` ${unanswered} sin responder.`} La IA redacta un borrador con el tono de tu ficha de producto; tú lo revisas antes de
          enviarlo.
        </p>
      </div>
      {error ? (
        <div className="px-5 py-4">
          <ErrorNote>No se pudieron leer las reseñas de Google Play. {error}</ErrorNote>
        </div>
      ) : reviews.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">No hay reseñas nuevas ni editadas en la última semana.</p>
      ) : (
        <ul>
          {reviews.map((r) => (
            <li key={r.id} className="border-t border-line px-5 py-4 first:border-t-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
                <span className="font-mono">{r.rating != null ? `${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}` : "–"}</span>
                <span className="font-medium">{r.author}</span>
                <span className="text-muted">
                  {formatDate(r.lastModified)}
                  {r.appVersion && ` · versión ${r.appVersion}`}
                  {r.language && ` · ${r.language}`}
                </span>
              </div>
              <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink-soft">{r.text || <span className="text-muted italic">(solo estrellas)</span>}</p>
              {r.reply && (
                <p className="mt-2 border-l-2 border-line-strong pl-3 text-[13px] text-muted">
                  Tu respuesta ({formatDate(r.reply.lastModified)}): {r.reply.text}
                </p>
              )}
              <ReviewReplyForm appId={appId} reviewId={r.id} currentReply={r.reply?.text ?? null} aiEnabled={aiEnabled} writeEnabled={config.writeEnabled} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
