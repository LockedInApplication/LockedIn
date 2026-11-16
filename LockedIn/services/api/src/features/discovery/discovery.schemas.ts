import { z } from "zod";
import { avatarPresetSchema } from "../profile/profile.schemas.js";
import { getDiscoveryConfig } from "../../config/env.js";

const text = (max: number) => z.string().transform(value => value.trim().replace(/\s+/gu, " ")).pipe(z.string().max(max));
export const discoveryProfileSchema = z.strictObject({
  publicName: text(60).pipe(z.string().min(1)),
  avatarPreset: avatarPresetSchema,
  bio: text(500),
  intention: z.enum(["LONG_TERM", "OPEN_TO_LONG_TERM"]),
  interests: z.array(text(30).pipe(z.string().min(1))).max(5).refine(values => new Set(values.map(value => value.toLocaleLowerCase("en-US"))).size === values.length),
  pace: text(240).nullable(),
  areaId: z.string().min(1).max(100),
});
export const configuredArea = (areaId: string) => getDiscoveryConfig().areas.some(area => area.id === areaId);
export const discoveryDraftSchema = discoveryProfileSchema.extend({ revision: z.number().int().nonnegative() }).strict();
export const discoveryPublishSchema = z.strictObject({ draftRevision: z.number().int().positive(), adultAttested: z.literal(true) });
export const discoveryVisibilitySchema = z.strictObject({ paused: z.boolean() });
export const emptyDiscoverySchema = z.strictObject({});
export const discoveryProfileParams = z.strictObject({ profileId: z.string().uuid() });
export const discoveryCandidatesQuery = z.strictObject({ areaId: z.string().min(1).max(100), before: z.string().min(1).max(512).optional() });
export const discoveryInvitationSchema = z.strictObject({ targetProfileId: z.string().uuid(), topicKey: z.enum(["support", "commitment", "communication"]), hello: z.string().trim().max(280), requestId: z.string().uuid() });
export const discoveryConnectionParams = z.strictObject({ id: z.string().uuid() });
export const discoveryConnectionQuery = z.strictObject({ before: z.string().uuid().optional() });
export const starterDraftSchema = z.strictObject({ text: z.string().max(2000), revision: z.number().int().nonnegative() });
export const starterShareSchema = z.strictObject({ draftRevision: z.number().int().nonnegative(), requestId: z.string().uuid() });
export const buildReadinessSchema = z.strictObject({ ready: z.boolean(), consentVersion: z.number().int().nonnegative() });
export const privateReflectionSchema = z.strictObject({ text: z.string().max(4000), revision: z.number().int().nonnegative() });
export const discoveryBlockSchema = z.strictObject({ profileId: z.string().uuid().optional(), connectionId: z.string().uuid().optional() }).refine(value => Number(!!value.profileId) + Number(!!value.connectionId) === 1);
export const discoveryReportSchema = z.strictObject({ sourceType: z.enum(["PROFILE", "INVITATION", "SHARED_RESPONSE"]), sourceId: z.string().uuid(), reason: z.enum(["HARASSMENT", "IMPERSONATION", "SPAM", "OTHER"]), detail: z.string().max(1000).optional(), requestId: z.string().uuid(), blockAlso: z.boolean().optional() });
export const discoveryReviewSchema = z.strictObject({ action: z.enum(["DISMISS", "SUSPEND"]), requestId: z.string().uuid() });
export const discoveryRestoreSchema = z.strictObject({ requestId: z.string().uuid() });
