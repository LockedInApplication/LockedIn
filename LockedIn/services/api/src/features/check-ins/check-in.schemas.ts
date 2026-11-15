import { z } from "zod";

export const responseSchema = z.object({
  answers: z.record(z.string(), z.string()),
  shareKeys: z.array(z.string()),
  contextNotes: z.record(z.string(), z.string().trim().max(600)).default({}),
  contextShareKeys: z.array(z.string()).default([]),
});
