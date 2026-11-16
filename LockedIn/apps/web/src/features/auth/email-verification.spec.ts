import { beforeEach, expect, it, vi } from "vitest";
import { checkEmailVerification, requestEmailVerification } from "./email-verification";

const transport = vi.hoisted(() => ({ getSession: vi.fn(), sendVerificationEmail: vi.fn() }));
vi.mock("@/utils/authCLient", () => ({ authClient: transport }));
const user = { id: "a", email: "a@example.test", emailVerified: false };
beforeEach(() => {
  transport.getSession.mockReset().mockResolvedValue({ data: { user }, error: null });
  transport.sendVerificationEmail.mockReset().mockResolvedValue({ data: { status: true }, error: null });
});
it("checks fresh server status, not cached cookie status", async () => {
  expect(await checkEmailVerification("a")).toEqual(user);
  expect(transport.getSession).toHaveBeenCalledWith({ query: { disableCookieCache: true }, fetchOptions: { cache: "no-store" } });
  transport.getSession.mockResolvedValue({ data: { user: { ...user, emailVerified: true } }, error: null });
  expect((await checkEmailVerification("a"))?.emailVerified).toBe(true);
});
it("rejects another account or an expired signed-in session", async () => {
  transport.getSession.mockResolvedValue({ data: { user: { ...user, id: "b" } }, error: null });
  await expect(checkEmailVerification("a")).rejects.toThrow("account changed");
  transport.getSession.mockResolvedValue({ data: null, error: null });
  await expect(checkEmailVerification("a")).rejects.toThrow("account changed");
  expect(await checkEmailVerification(null)).toBeNull();
});
it("does not leak provider errors into status feedback", async () => {
  transport.getSession.mockResolvedValue({ data: null, error: { message: "secret" } });
  await expect(checkEmailVerification("a")).rejects.toThrow("Could not check");
});
it("sends only the current signed-in email with a fixed local callback", async () => {
  expect(await requestEmailVerification("a", "wrong@example.test", "https://app.example.test")).toBe("requested");
  expect(transport.sendVerificationEmail).toHaveBeenCalledWith({ email: "a@example.test", callbackURL: "https://app.example.test/verify-email?pending=1" });
});
it("does not send a request for an already verified account", async () => {
  transport.getSession.mockResolvedValue({ data: { user: { ...user, emailVerified: true } }, error: null });
  expect(await requestEmailVerification("a", user.email, "https://app.example.test")).toBe("verified");
  expect(transport.sendVerificationEmail).not.toHaveBeenCalled();
});
it("retains trimmed manual email entry for a signed-out user", async () => {
  transport.getSession.mockResolvedValue({ data: null, error: null });
  await requestEmailVerification(null, " person@example.test ", "https://app.example.test");
  expect(transport.sendVerificationEmail).toHaveBeenCalledWith({ email: "person@example.test", callbackURL: "https://app.example.test/verify-email?pending=1" });
});
it("handles both provider rejection and network exceptions with safe retry feedback", async () => {
  transport.sendVerificationEmail.mockResolvedValue({ error: { message: "provider key secret" } });
  await expect(requestEmailVerification("a", user.email, "https://app.example.test")).rejects.toThrow("Could not send");
  transport.sendVerificationEmail.mockRejectedValue(new Error("network secret"));
  await expect(requestEmailVerification("a", user.email, "https://app.example.test")).rejects.toThrow("Could not send");
});
it("never sends after an account changes", async () => {
  transport.getSession.mockResolvedValue({ data: { user: { ...user, id: "b" } }, error: null });
  await expect(requestEmailVerification("a", user.email, "https://app.example.test")).rejects.toThrow("account changed");
  expect(transport.sendVerificationEmail).not.toHaveBeenCalled();
});
