import { z } from "zod";

// Store listing experiments (F8). Google Play runs the A/B test in Play Console (Store listing
// experiments); Rankeo keeps the plan, the result Play reports and what was learned. Pure: schema and labels.

export const EXPERIMENT_STATUSES = ["planned", "running", "done"] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const EXPERIMENT_STATUS_LABEL: Record<ExperimentStatus, string> = {
  planned: "Planeado",
  running: "En marcha",
  done: "Terminado",
};

const optionalDate = z
  .union([z.iso.date(), z.literal("")])
  .transform((v) => (v === "" ? null : v));

/** What the experiment form sends. Empty dates are stored as null. */
export const experimentInputSchema = z
  .object({
    name: z.string().trim().min(1, "Ponle un nombre al experimento").max(120),
    hypothesis: z.string().trim().max(1000).default(""),
    variant: z.string().trim().max(2000).default(""),
    metric: z.string().trim().max(200).default(""),
    startDate: optionalDate.default(""),
    endDate: optionalDate.default(""),
    result: z.string().trim().max(2000).default(""),
    learned: z.string().trim().max(2000).default(""),
    status: z.enum(EXPERIMENT_STATUSES).default("planned"),
  })
  .refine((e) => !e.startDate || !e.endDate || e.endDate >= e.startDate, {
    message: "La fecha de fin no puede ser anterior a la de inicio",
    path: ["endDate"],
  });

export type ExperimentInput = z.infer<typeof experimentInputSchema>;

/** Play recommends at least a week so weekdays and weekends both count. */
export const MIN_EXPERIMENT_DAYS = 7;
