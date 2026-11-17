import { z } from "zod";
import { avatarPresetSchema } from "../profile/profile.schemas.js";
import { getDiscoveryConfig } from "../../config/env.js";
import { photoIdsSchema } from "./photos/photo.schemas.js";
import { discoveryIntentions, profilePromptKey } from "./discovery-matching.js";

const text = (max: number) => z.string().transform(value => value.trim().replace(/\s+/gu, " ")).pipe(z.string().max(max));
const writtenKey = z.enum(["showing_up", "sunday", "cared_for", "together", "tradition"]);
const photoKey = z.enum(["story", "happy_place", "favorite_memory"]);
const uniqueBy = <T>(items: T[], key: (item: T) => string) => new Set(items.map(key)).size === items.length;
export const discoveryProfileSchema = z.strictObject({
  publicName: text(60).pipe(z.string().min(1)),
  avatarPreset: avatarPresetSchema,
  bio: text(500),
  intention: z.enum(discoveryIntentions),
  interests: z.array(text(30).pipe(z.string().min(1))).max(5).refine(values => new Set(values.map(value => value.toLocaleLowerCase("en-US"))).size === values.length),
  pace: text(240).nullable(),
  areaId: z.string().min(1).max(100),
  photoIds: photoIdsSchema.optional(),
  promptAnswer: text(240).optional(),
  prompts: z.array(z.strictObject({ key: writtenKey, answer: text(240).pipe(z.string().min(1)) })).max(3).refine(items => uniqueBy(items, item => item.key)).optional(),
  photoPrompts: z.array(z.strictObject({ photoId: z.string().uuid(), key: photoKey })).max(3).refine(items => uniqueBy(items, item => item.photoId)).optional(),
  about: z.strictObject({
    heightCm: z.number().int().min(90).max(250).optional(),
    languages: z.array(text(30).pipe(z.string().min(1))).max(5).optional(),
    pets: z.enum(["have", "open", "none"]).optional(),
    familyPlans: z.enum(["want", "dont_want", "open", "unsure"]).optional(),
  }).optional(),
});
export const configuredArea = (areaId: string) => getDiscoveryConfig().areas.some(area => area.id === areaId);
export const discoveryDraftSchema = discoveryProfileSchema.extend({ revision: z.number().int().nonnegative() }).strict();
export const discoveryPublishSchema = z.strictObject({ draftRevision: z.number().int().positive(), adultAttested: z.literal(true) });
export const discoveryVisibilitySchema = z.strictObject({ paused: z.boolean() });
export const emptyDiscoverySchema = z.strictObject({});
export const discoveryProfileParams = z.strictObject({ profileId: z.string().uuid() });
const discoveryCursorQuery = z.string().min(1).max(512).optional();
export const discoveryCandidatesQuery = z.union([
  z.strictObject({ areaId: z.string().min(1).max(100), before: discoveryCursorQuery }),
  z.strictObject({ mode: z.literal("distance"), before: discoveryCursorQuery }),
]);
export const discoveryInvitationSchema = z.strictObject({
  targetProfileId: z.string().uuid(), topicKey: z.enum(["support", "commitment", "communication", profilePromptKey]), hello: z.string().trim().max(280), requestId: z.string().uuid(),
  expectedPromptAnswer: text(240).optional(), replyPromptKey: writtenKey.optional(), replyPhotoId: z.string().uuid().optional(),
})
  .refine(value => value.topicKey === profilePromptKey
    ? !!value.hello && (value.replyPhotoId ? !value.replyPromptKey && value.expectedPromptAnswer === undefined : !!value.expectedPromptAnswer)
    : value.expectedPromptAnswer === undefined && !value.replyPromptKey && !value.replyPhotoId);
export const discoveryConnectionParams = z.strictObject({ id: z.string().uuid() });
export const discoveryConnectionQuery = z.strictObject({ before: z.string().uuid().optional() });
export const starterDraftSchema = z.strictObject({ text: z.string().max(2000), revision: z.number().int().nonnegative() });
export const starterShareSchema = z.strictObject({ draftRevision: z.number().int().nonnegative(), requestId: z.string().uuid() });
export const buildReadinessSchema = z.strictObject({ ready: z.boolean(), consentVersion: z.number().int().nonnegative() });
export const privateReflectionSchema = z.strictObject({ text: z.string().max(4000), revision: z.number().int().nonnegative() });
export const discoveryBlockSchema = z.strictObject({ profileId: z.string().uuid().optional(), connectionId: z.string().uuid().optional() }).refine(value => Number(!!value.profileId) + Number(!!value.connectionId) === 1);
export const discoveryReportSchema = z.strictObject({ sourceType: z.enum(["PROFILE", "INVITATION", "SHARED_RESPONSE", "PHOTO"]), sourceId: z.string().uuid(), reason: z.enum(["HARASSMENT", "IMPERSONATION", "SPAM", "OTHER"]), detail: z.string().max(1000).optional(), requestId: z.string().uuid(), blockAlso: z.boolean().optional() });
export const discoveryReviewSchema = z.strictObject({ action: z.enum(["DISMISS", "SUSPEND"]), requestId: z.string().uuid() });
export const discoveryRestoreSchema = z.strictObject({ requestId: z.string().uuid() });
