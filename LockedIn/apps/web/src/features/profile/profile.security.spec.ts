import { expect, it, vi } from "vitest";
vi.mock("@/utils/authCLient", () => ({
  authClient: { changePassword: async () => ({ error: null }) },
}));
import { changeProfilePassword } from "./profile.security";
it("rejects mismatched confirmation", async () => {
  await expect(
    changeProfilePassword({
      currentPassword: "old-password",
      newPassword: "new-password",
      confirmPassword: "different",
    }),
  ).rejects.toThrow("match");
});
it.each(["short", "a".repeat(129)])(
  "rejects passwords outside auth policy",
  async (newPassword) => {
    await expect(
      changeProfilePassword({
        currentPassword: "old-password",
        newPassword,
        confirmPassword: newPassword,
      }),
    ).rejects.toThrow("8");
  },
);
it("accepts valid passwords", async () => {
  await expect(
    changeProfilePassword({
      currentPassword: "old-password",
      newPassword: "new-password",
      confirmPassword: "new-password",
    }),
  ).resolves.toBeUndefined();
});
