import { authClient } from "@/utils/authCLient";
export async function changeProfilePassword({
  currentPassword,
  newPassword,
  confirmPassword,
  userId,
}: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  userId?: string;
}) {
  if (newPassword !== confirmPassword)
    throw new Error("Your new passwords must match.");
  if (newPassword.length < 8 || newPassword.length > 128)
    throw new Error("Use a password between 8 and 128 characters.");
  const result = await authClient.changePassword(
    { currentPassword, newPassword, revokeOtherSessions: true },
    userId ? { headers: { "X-Profile-Owner": userId } } : undefined,
  );
  if (result.error)
    throw new Error(result.error.message || "Unable to change your password.");
}
