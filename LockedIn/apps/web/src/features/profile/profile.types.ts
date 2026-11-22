export type AvatarPreset = "initials" | "spark" | "sun" | "moon" | "leaf";
export type AccountDeletionRequest = { id: string; requestedAt: string };
export type Profile = {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarPreset: AvatarPreset;
  activityEmails: boolean;
  inAppActivity: boolean;
  accountDeletionRequest?: AccountDeletionRequest | null;
};
export type ProfileDetailsInput = Pick<Profile, "displayName" | "avatarPreset">;
export type ProfileNotificationsInput = Pick<
  Profile,
  "activityEmails" | "inAppActivity"
>;
