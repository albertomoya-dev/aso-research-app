"use client";

import { useActionState, useState } from "react";
import { draftReplyAction, type PlayActionState, type ReplyDraftState, replyToReview } from "@/app/play-actions";
import { PLAY_REPLY_LIMIT } from "@/lib/play-console/constants";
import { ConfirmButton } from "./confirm-button";
import { buttonSecondary } from "./ui";

type Props = { appId: number; reviewId: string; currentReply: string | null; aiEnabled: boolean; writeEnabled: boolean };

/** Draft with Claude, edit and (only with GOOGLE_PLAY_ALLOW_WRITE=1 and a confirmation) send the reply to one review. */
export function ReviewReplyForm({ appId, reviewId, currentReply, aiEnabled, writeEnabled }: Props) {
  const [text, setText] = useState(currentReply ?? "");
  const [seen, setSeen] = useState<number | undefined>(undefined);
  const [draft, draftAction, drafting] = useActionState<ReplyDraftState, FormData>(draftReplyAction, null);
  const [sent, sendAction, sending] = useActionState<PlayActionState, FormData>(replyToReview, null);
  // A new AI draft replaces the text once; edits after that are kept.
  if (draft?.text && draft.nonce !== seen) {
    setSeen(draft.nonce);
    setText(draft.text);
  }
  const length = [...text].length;
  const over = length > PLAY_REPLY_LIMIT;

  return (
    <div className="mt-2 flex flex-col gap-2">
      <label className="sr-only" htmlFor={`reply-${reviewId}`}>
        Respuesta
      </label>
      <textarea
        id={`reply-${reviewId}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Escribe la respuesta o pide un borrador a la IA."
        className="min-h-20 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-2 focus:outline-brand/50"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-mono text-xs ${over ? "text-danger" : "text-muted"}`}>
          {length}/{PLAY_REPLY_LIMIT}
        </span>
        {aiEnabled && (
          <form action={draftAction}>
            <input type="hidden" name="appId" value={appId} />
            <input type="hidden" name="reviewId" value={reviewId} />
            <button type="submit" disabled={drafting} aria-busy={drafting} className={buttonSecondary}>
              {drafting ? "Redactando…" : "Redactar respuesta con IA"}
            </button>
          </form>
        )}
        {writeEnabled && (
          <form action={sendAction}>
            <input type="hidden" name="appId" value={appId} />
            <input type="hidden" name="reviewId" value={reviewId} />
            <input type="hidden" name="text" value={text} />
            <input type="hidden" name="confirm" value="yes" />
            <ConfirmButton
              message={`¿Publicar esta respuesta en Google Play? Será pública${currentReply ? " y sustituirá a la actual" : ""}.`}
              disabled={sending || !text.trim() || over}
              aria-busy={sending}
              className={buttonSecondary}
            >
              {sending ? "Enviando…" : currentReply ? "Sustituir respuesta" : "Responder"}
            </ConfirmButton>
          </form>
        )}
      </div>
      <div aria-live="polite" className="text-[13px]">
        {draft?.error && <p className="text-danger">{draft.error}</p>}
        {draft?.cut && <p className="text-warn-fg">La IA se pasó de {PLAY_REPLY_LIMIT} caracteres y se ha recortado: revísalo.</p>}
        {draft?.notes?.map((n) => (
          <p key={n} className="text-muted">
            {n}
          </p>
        ))}
        {sent?.error && <p className="text-danger">{sent.error}</p>}
        {sent?.ok && <p className="text-up">{sent.message}</p>}
        {!writeEnabled && text.trim() && (
          <p className="text-muted">Modo solo lectura: copia la respuesta en Play Console o activa GOOGLE_PLAY_ALLOW_WRITE=1 para responder desde aquí.</p>
        )}
      </div>
    </div>
  );
}
