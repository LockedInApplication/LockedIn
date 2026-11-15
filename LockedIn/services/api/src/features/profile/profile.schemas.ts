import { z } from "zod";
export const avatarPresetSchema = z.enum([
  "initials",
  "spark",
  "sun",
  "moon",
  "leaf",
]);
export const profileDetailsSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    avatarPreset: avatarPresetSchema,
  })
  .strict();
export const profileNotificationsSchema = z
  .object({ activityEmails: z.boolean(), inAppActivity: z.boolean() })
  .strict();
