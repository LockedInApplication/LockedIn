import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { authRoutes } from "./routes/auth.routes.js";

const { db, findDeletion, send, origin } = vi.hoisted(() => {
  vi.stubEnv("BETTER_AUTH_URL", "https://api.example.test");
  vi.stubEnv("BETTER_AUTH_TELEMETRY_ENABLED", "false");
  return {
    db: { user: [], account: [], session: [], verification: [] } as Record<string, unknown[]>,
    findDeletion: vi.fn(),
    send: vi.fn<(message: { to: string; subject: string; text: string; html: string; idempotencyKey?: string }) => Promise<void>>(),
    origin: "https://web.example.test",
  };
});

vi.mock("better-auth/adapters/prisma", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { prismaAdapter: () => memoryAdapter(db) };
});
vi.mock("./lib/prisma.js", () => ({ prisma: { accountDeletionRequest: { findUnique: findDeletion } } }));
vi.mock("./lib/email/providers/Resend.js", () => ({ default: send }));
vi.mock("./config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config/env.js")>();
  return { ...actual, env: { ...actual.env, APP_URL: origin, REQUIRE_EMAIL_VERIFICATION: "true" } };
});

const app = Fastify();
const email = "member@example.test";
const password = "Example password 1";
const post = (url: string, payload: object) => app.inject({ method: "POST", url, headers: { origin }, payload });
const signup = (address = email, name = "Member", credential = password) => post("/api/auth/sign-up/email", {
  name, email: address, password: credential, callbackURL: `${origin}/verify-email`,
});

beforeAll(async () => { await app.register(authRoutes).ready(); });
beforeEach(() => {
  for (const table of Object.values(db)) table.splice(0);
  send.mockReset().mockResolvedValue(undefined);
  findDeletion.mockReset().mockResolvedValue(null);
});
afterAll(async () => { await app.close(); vi.unstubAllEnvs(); });

it("emails the existing address privately without exposing, replacing or signing into its account", async () => {
  const initial = await signup();
  expect(initial.statusCode).toBe(200);
  expect(initial.json()).toEqual({ token: null });
  expect(initial.headers["cache-control"]).toBe("no-store");
  expect(initial.headers["set-cookie"]).toBeUndefined();
  expect(send.mock.calls[0]?.[0]).toMatchObject({ to: email, subject: "Verify your LockedIn email" });
  const verify = new URL(send.mock.calls[0][0].text.split("\n").find(line => line.startsWith("https://"))!);
  expect((await app.inject({ url: verify.pathname + verify.search })).statusCode).toBe(302);

  const otherPassword = "A different password";
  const duplicate = await signup(email.toUpperCase(), "Different name", otherPassword);
  expect(duplicate.statusCode).toBe(200);
  expect(duplicate.headers["set-cookie"]).toBeUndefined();
  expect(duplicate.body).toBe(initial.body);
  expect(duplicate.headers["cache-control"]).toBe(initial.headers["cache-control"]);
  expect(db.user).toHaveLength(1);

  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  const notice = send.mock.calls[1][0];
  expect(notice).toMatchObject({ to: email, subject: "You already have a LockedIn account" });
  expect(notice.text).toContain("You already have a space here.");
  expect(notice.html).toContain(`href="${origin}/login"`);
  expect(notice.html).toContain(`href="${origin}/forgot-password"`);
  expect(notice.text).not.toMatch(/Different name|token=|A different password/);
  expect(notice.idempotencyKey).toMatch(/^existing-account\/[0-9a-f]{64}$/);

  await signup();
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
  expect(send.mock.calls[2][0]).toEqual(notice);
  expect((await post("/api/auth/sign-in/email", { email, password })).json().user.name).toBe("Member");
  expect((await post("/api/auth/sign-in/email", { email, password: otherPassword })).statusCode).toBe(401);
});

it("returns the same success for a pending-deletion account but does not send a notice", async () => {
  await signup();
  findDeletion.mockResolvedValue({ state: "CLEANING_PHOTOS" });
  const duplicate = await signup();
  expect(duplicate.statusCode).toBe(200);
  await vi.waitFor(() => expect(findDeletion).toHaveBeenCalledOnce());
  expect(send).toHaveBeenCalledOnce();
});

it("does not make sign-up wait for outbound mail or log sensitive delivery errors", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  let rejectSend!: (error: Error) => void;
  send.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSend = reject; }));
  try {
    expect((await signup()).statusCode).toBe(200);
    send.mockRejectedValueOnce(new Error(`Delivery failed for ${email}`));
    expect((await signup()).statusCode).toBe(200);
    rejectSend(new Error(`Verification token for ${email}`));
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(2));
    expect(error.mock.calls).toEqual(Array.from({ length: 2 }, () => ["Could not queue a LockedIn sign-up email."]));
  } finally { error.mockRestore(); }
});
