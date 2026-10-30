/**
 * reviews.reply: "Replies of more than approximately 350 characters will be rejected." (ReviewsReplyRequest,
 * Android Publisher v3 discovery document, revision 20261029, read on 2026-10-30). Kept apart from the
 * client so browser code can import it.
 */
export const PLAY_REPLY_LIMIT = 350;

/** Search terms CSV uploads are capped below the 4 MB server action body limit (serverActions.bodySizeLimit in next.config.ts). */
export const MAX_CSV_BYTES = 3_500_000;

/** Shown both by the form (before sending) and by the action. */
export const CSV_TOO_BIG_MESSAGE = "El archivo pasa de 3,5 MB: descarga un periodo más corto.";
