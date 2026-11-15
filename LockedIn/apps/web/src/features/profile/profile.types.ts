export type AvatarPreset = "initials" | "spark" | "sun" | "moon" | "leaf";
export type Profile = {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarPreset: AvatarPreset;
  activityEmails: boolean;
  inAppActivity: boolean;
};
export type ProfileDetailsInput = Pick<Profile, "displayName" | "avatarPreset">;
export type ProfileNotificationsInput = Pick<
  Profile,
  "activityEmails" | "inAppActivity"
>;
