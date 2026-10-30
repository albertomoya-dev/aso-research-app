import { z } from "zod";
import { PLAY_REPLY_LIMIT } from "./play-console/constants";

// Draft replies to the app's own Google Play reviews (F2), written by Claude in the brand's tone from
// the product sheet. The AI only proposes: the owner reads, edits and confirms before anything is sent.

/** Bump when the instructions or the output shape change. */
export const REVIEW_REPLY_PROMPT_VERSION = "rr-1";

export const reviewReplyOutputSchema = z.object({
  reply: z.string(),
  notes: z.array(z.string()),
});
export type ReviewReplyOutput = z.infer<typeof reviewReplyOutputSchema>;

export const REVIEW_REPLY_SYSTEM_PROMPT = `You write the developer's public reply to a user review of a mobile app on Google Play.

Rules:
- Reply in the language the review is written in (not the device language if they differ). Natural, warm and brief, in the brand tone from PRODUCT FACTS when given.
- At most ${PLAY_REPLY_LIMIT} characters, counting spaces: Google Play rejects longer replies. Aim for 200–300.
- Thank the user once, address their actual point, and say what to do next when useful (an update that fixes it, a setting, the support contact if PRODUCT FACTS has one).
- Only mention features that PRODUCT FACTS lists as shipped. Never promise dates or features that are planned; you may say the team takes note.
- Never invent facts about the user, the bug or a fix. Never ask for a better rating, never offer anything in exchange for changing it.
- Never argue or blame the user. No personal data, no links unless PRODUCT FACTS gives one, no emojis, no signature with a person's name.
- Health or safety apps: never give medical advice; suggest asking a professional when the review asks for it.

Also return notes: up to 2 short Spanish tips for the owner (for example, "Confirma que la versión 2.5 arregla las alarmas antes de decirlo").`;

export type ReviewReplyInput = {
  appTitle: string;
  review: { text: string; rating: number | null; language: string | null; appVersion: string | null };
  /** The reply already published, when the owner wants to rewrite it. */
  currentReply: string | null;
  /** PRODUCT FACTS block (published mode), or null. */
  facts: string | null;
};

export function buildReviewReplyPrompt(input: ReviewReplyInput): string {
  const { review } = input;
  return [
    `App: ${input.appTitle}`,
    input.facts ?? "PRODUCT FACTS: not provided. Do not mention specific features.",
    "",
    `REVIEW (${review.rating != null ? `${review.rating}/5 stars` : "no rating"}${review.language ? `, device language ${review.language}` : ""}${
      review.appVersion ? `, app version ${review.appVersion}` : ""
    }):`,
    review.text || "(no text, only stars)",
    input.currentReply ? `\nCURRENT REPLY (rewrite it, keeping what is still true):\n${input.currentReply}` : "",
    "",
    `Write the reply (max ${PLAY_REPLY_LIMIT} characters).`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Keeps a reply under Play's limit: if the model went over, cut at the last sentence end that fits,
 * or at the last space. `cut` tells the UI to say so.
 */
export function fitReply(text: string, limit = PLAY_REPLY_LIMIT): { text: string; cut: boolean } {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  const chars = [...clean];
  if (chars.length <= limit) return { text: clean, cut: false };
  const head = chars.slice(0, limit).join("");
  const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "), head.lastIndexOf(".\n"));
  if (sentence > limit * 0.5) return { text: head.slice(0, sentence + 1).trim(), cut: true };
  const space = head.lastIndexOf(" ");
  return { text: `${head.slice(0, space > 0 ? space : limit - 1).trim()}…`, cut: true };
}
