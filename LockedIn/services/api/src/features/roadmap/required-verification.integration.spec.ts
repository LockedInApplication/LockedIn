import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mailbox = vi.hoisted(() => new Map<string, string[]>());
vi.mock("../../lib/email.js", () => ({
  sendEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
    mailbox.set(user.email, [...(mailbox.get(user.email) ?? []), url]);
  },
  sendPasswordResetEmail: async () => {},
}));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("required email verification on signup", () => {
  let app: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
  let restore: () => void;
  beforeAll(async () => {
    const { env } = await import("../../config/env.js");
    const previous = env.REQUIRE_EMAIL_VERIFICATION;
    env.REQUIRE_EMAIL_VERIFICATION = "true";
    restore = () => { env.REQUIRE_EMAIL_VERIFICATION = previous; };
    app = await (await import("../../app.js")).buildServer();
  });
  afterAll(async () => { restore?.(); await app?.close(); if (app) await (await import("../../lib/prisma.js")).prisma.$disconnect(); });

  it("blocks sign-in until a real verification link is followed, with resend available", async () => {
    const email = `verify-${randomUUID()}@example.test`, password = randomUUID();
    const origin = "http://localhost:3001";
    const callbackURL = `${origin}/verify-email?pending=1`;
    const post = (url: string, payload: object) => app.inject({ method: "POST", url, headers: { origin }, payload });
    const signup = await post("/api/auth/sign-up/email", { name: "Local verification fixture", email, password, callbackURL });
    expect(signup.statusCode).toBe(200);
    expect(signup.json().token).toBeNull();
    expect(mailbox.get(email)).toHaveLength(1);
    const blocked = await post("/api/auth/sign-in/email", { email, password });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe("EMAIL_NOT_VERIFIED");
    const resent = await post("/api/auth/send-verification-email", { email, callbackURL });
    expect(resent.statusCode).toBe(200);
    expect(mailbox.get(email)).toHaveLength(2);
    const link = new URL(mailbox.get(email)!.at(-1)!);
    const verified = await app.inject({ url: `${link.pathname}${link.search}` });
    expect(verified.statusCode).toBe(302);
    expect(verified.headers.location).toBe(callbackURL);
    const login = await post("/api/auth/sign-in/email", { email, password });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.emailVerified).toBe(true);
    const token = login.cookies.find(cookie => cookie.name === "better-auth.session_token");
    expect(token).toBeDefined();
    const overview = await app.inject({ url: "/api/journey/overview", headers: { cookie: `${token!.name}=${encodeURIComponent(token!.value)}` } });
    expect(overview.statusCode).toBe(200);
  });
});
