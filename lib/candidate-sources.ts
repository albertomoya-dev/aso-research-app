// No "@/" imports here: db/schema.ts imports this file and drizzle-kit loads it without the alias.

/**
 * Sources of a candidate keyword in Keywords › Encontrar. AI ideas keep their own table
 * (`ai_suggestions`); `keyword_candidates` stores the others, plus the measured popularity of AI ideas.
 */
export const CANDIDATE_SOURCES = ["autocomplete", "ai", "top10", "reviews"] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export const CANDIDATE_STATUSES = ["pending", "followed", "dismissed"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];
