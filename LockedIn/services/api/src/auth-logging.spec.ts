import { Writable } from "node:stream";
import type { BetterAuthOptions } from "better-auth";
import { afterEach, expect, it, vi } from "vitest";
import { buildServer } from "./app.js";

const { makeAuth, handler, sendEmail } = vi.hoisted(() => ({
  makeAuth: vi.fn((_options: BetterAuthOptions) => ({ handler })),
  handler: vi.fn<(request: Request) => Promise<Response>>(),
  sendEmail: vi.fn(),
}));

vi.mock("better-auth", () => ({ betterAuth: makeAuth }));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: vi.fn() }));
vi.mock("./lib/prisma.js", () => ({ prisma: {} }));
vi.mock("./lib/email.js", () => ({ sendEmail, sendPasswordResetEmail: vi.fn() }));
vi.mock("./routes/users.routes.js", () => ({ usersRoutes: async () => {} }));
vi.mock("./routes/journey.routes.js", () => ({ journeyRoutes: async () => {} }));
vi.mock("./features/profile/profile.routes.js", () => ({ registerProfileRoutes: async () => {} }));
vi.mock("./features/discovery/discovery.routes.js", () => ({ registerDiscoveryRoutes: async () => {} }));

afterEach(() => {
  handler.mockReset();
  sendEmail.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function injectWithLogs(url: string) {
  let logs = "";
  const logStream = new Writable({
    write(chunk, _encoding, done) {
      logs += chunk.toString();
      done();
    },
  });
  const server = await buildServer({ logStream });
  try {
    const response = await server.inject({ method: "GET", url });
    return { response, logs };
  } finally {
    await server.close();
  }
}

it("passes the full verification URL to auth but logs only its path", async () => {
  const url = "/api/auth/verify-email?token=dummy-verification-token&callbackURL=%2Fverify-email";
  handler.mockResolvedValue(new Response(null, {
    status: 302,
    headers: { location: "/verify-email" },
  }));

  const { response, logs } = await injectWithLogs(url);

  expect(response.statusCode).toBe(302);
  expect(response.headers.location).toBe("/verify-email");
  expect(handler.mock.calls[0][0].url).toContain(url);
  expect(logs).toContain('"url":"/api/auth/verify-email"');
  expect(logs).toContain('"statusCode":302');
  expect(logs).not.toContain("dummy-verification-token");
  expect(logs).not.toContain("callbackURL");
});

it.each([
  ["/api/auth/verify-email?token=dummy-verification-token&callbackURL=%2Fverify-email", "/api/auth/verify-email", "dummy-verification-token"],
  ["/api/auth/reset-password/dummy-reset-token?callbackURL=%2Freset-password", "/api/auth/reset-password/:token", "dummy-reset-token"],
])("keeps tokens out of failure logs for %s", async (url, loggedPath, token) => {
  handler.mockRejectedValue(new Error(`Request failed for ${url}`));

  const { response, logs } = await injectWithLogs(url);

  expect(response.statusCode).toBe(500);
  expect(response.json()).toMatchObject({ code: "AUTH_FAILURE" });
  expect(logs).toContain(`"url":"${loggedPath}"`);
  expect(logs).toContain("Authentication error");
  expect(logs).not.toContain(token);
  expect(logs).not.toContain("callbackURL");
});

it("hands the verification link to email delivery without printing it in development", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const user = { id: "user-1", email: "user@example.test", name: "Test User", emailVerified: false, createdAt: new Date(), updatedAt: new Date() };
  const url = "https://app.example.test/api/auth/verify-email?token=dummy-email-token";
  const callback = makeAuth.mock.calls[0][0].emailVerification?.sendVerificationEmail;
  expect(callback).toBeTypeOf("function");

  await callback!({ user, url, token: "dummy-email-token" });

  expect(sendEmail).toHaveBeenCalledWith({ user, url });
  expect(log).not.toHaveBeenCalled();
});
