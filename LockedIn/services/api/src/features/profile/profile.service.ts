import { prisma } from "../../lib/prisma.js";
import { accountDeletionRequestSelect } from "./account-deletion.service.js";
import type { z } from "zod";
import type {
  profileDetailsSchema,
  profileNotificationsSchema,
} from "./profile.schemas.js";
const select = {
  id: true,
  email: true,
  emailVerified: true,
  name: true,
  displayName: true,
  avatarPreset: true,
  activityEmails: true,
  inAppActivity: true,
  accountDeletionRequest: { select: accountDeletionRequestSelect },
} as const;
function view(row: {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  displayName: string | null;
  avatarPreset: string;
  activityEmails: boolean;
  inAppActivity: boolean;
  accountDeletionRequest: { id: string; requestedAt: Date } | null;
}) {
  const { name, ...profile } = row;
  return {
    id: profile.id,
    email: profile.email,
    emailVerified: profile.emailVerified,
    displayName: profile.displayName ?? name ?? "",
    avatarPreset: profile.avatarPreset,
    activityEmails: profile.activityEmails,
    inAppActivity: profile.inAppActivity,
    accountDeletionRequest: profile.accountDeletionRequest,
  };
}
export async function getProfile(userId: string) {
  return view(
    await prisma.user.findUniqueOrThrow({ where: { id: userId }, select }),
  );
}
export async function updateProfile(
  userId: string,
  data:
    | z.infer<typeof profileDetailsSchema>
    | z.infer<typeof profileNotificationsSchema>,
) {
  return view(
    await prisma.user.update({ where: { id: userId }, data, select }),
  );
}
