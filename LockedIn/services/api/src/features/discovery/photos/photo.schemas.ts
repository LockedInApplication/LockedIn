import { z } from "zod";

export const photoIdsSchema = z.array(z.string().uuid()).max(3).refine(ids => new Set(ids).size === ids.length);
export const photoParamsSchema = z.strictObject({ id: z.string().uuid() });
export const photoUploadFieldsSchema = z.strictObject({ requestId: z.string().uuid(), draftRevision: z.coerce.number().int().nonnegative(), replacePhotoId: z.string().uuid().optional() });
export const photoDecisionRequestSchema = z.strictObject({ requestId: z.string().uuid(), decisionRevision: z.number().int().positive() });
export const photoDeleteSchema = z.strictObject({ requestId: z.string().uuid(), draftRevision: z.number().int().nonnegative() });
export const photoReviewSchema = photoDecisionRequestSchema.extend({ action: z.enum(["APPROVE", "REJECT", "REMOVE"]), reason: z.string().trim().min(1).max(1000) }).strict();
