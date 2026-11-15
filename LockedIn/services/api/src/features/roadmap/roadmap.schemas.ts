import { z } from "zod";

export const nextStepSchema = z.object({
  title: z.string().trim().min(3).max(120),
  details: z.string().trim().max(600).optional(),
  targetDate: z.string().date().optional(),
});

export const reflectionSchema = z.object({
  outcome: z.enum(["COMPLETED", "CHANGED", "PAUSED", "NOT_RELEVANT"]),
  note: z.string().trim().max(600).optional(),
});
