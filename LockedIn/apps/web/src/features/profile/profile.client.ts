import { journeyRequest } from "@/features/journey/journey.client";
import type {
  Profile,
  ProfileDetailsInput,
  ProfileNotificationsInput,
} from "./profile.types";
export const loadProfile = (signal?: AbortSignal) =>
  journeyRequest<Profile>("/api/profile", { cache: "no-store", signal });
export const saveProfileDetails = (
  input: ProfileDetailsInput,
  userId: string,
) =>
  journeyRequest<Profile>("/api/profile/details", {
    method: "PUT",
    headers: { "X-Profile-Owner": userId },
    body: JSON.stringify(input),
    cache: "no-store",
  });
export const saveNotificationPreferences = (
  input: ProfileNotificationsInput,
  userId: string,
) =>
  journeyRequest<Profile>("/api/profile/notifications", {
    method: "PUT",
    headers: { "X-Profile-Owner": userId },
    body: JSON.stringify(input),
    cache: "no-store",
  });
