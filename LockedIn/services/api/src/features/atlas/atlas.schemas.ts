import { z } from "zod";

export const meaningResponseSchema = z.object({
  definition: z.string().trim().min(8).max(500),
  example: z.string().trim().min(8).max(500),
  notMeaning: z.string().trim().min(8).max(500),
});

export const heardSummarySchema = z.object({
  summary: z.string().trim().min(8).max(500),
});

export const heardConfirmationSchema = z.object({
  status: z.enum(["CONFIRMED", "ALMOST", "MISSING"]),
});

export const sharedDefinitionSchema = z.object({
  definition: z.string().trim().min(8).max(500),
});

export const meaningSelectionSchema = z.object({
  mode: z.enum(["PROPOSAL", "BLEND", "KEEP_BOTH"]),
  proposalId: z.string().uuid().nullable().optional(),
});

export const meaningResolutionSchema = z.object({
  definition: z.string().trim().min(8).max(800),
  expectedVersion: z.number().int().min(0),
  kind: z.enum(["BLEND", "REVISION", "PAIRED"]),
});

export const meaningApprovalSchema = z.object({
  candidateVersion: z.number().int().positive(),
});
