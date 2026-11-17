import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

describe.skipIf(process.env.NOTIFICATIONS_INTEGRATION !== "true")("account deletion", () => {
  let db: typeof import("../../lib/prisma.js").prisma;
  let app: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
  const origin = "http://localhost:3001";
  const password = "disposable-test-password";
  let hash: string;

  beforeAll(async () => {
    ({ prisma: db } = await import("../../lib/prisma.js"));
    const { auth } = await import("../../lib/auth.js");
    hash = await (await auth.$context).password.hash(password);
    app = await (await import("../../app.js")).buildServer();
  });

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  function cookie(token: string) {
    const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
      .update(token).digest("base64");
    return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
  }

  async function seed(id: string) {
    await db.user.create({
      data: {
        id, email: `${id}@example.test`, name: id, emailVerified: true,
        accounts: { create: { id: `credential-${id}`, accountId: id, providerId: "credential", password: hash } },
        sessions: {
          create: [1, 2].map((device) => ({
            id: `${id}-${device}`, token: `${id}-token-${device}`,
            expiresAt: new Date(Date.now() + 3600000),
          })),
        },
      },
    });
  }

  function attempt(
    id: string,
    { body = { password }, requestOrigin = origin, owner = id, authenticated = true }:
    { body?: object; requestOrigin?: string; owner?: string; authenticated?: boolean } = {},
  ) {
    return app.inject({
      method: "POST", url: "/api/profile/account/delete", payload: body,
      headers: {
        ...(authenticated ? { cookie: cookie(`${id}-token-1`) } : {}),
        "x-profile-owner": owner, origin: requestOrigin,
      },
    });
  }

  it("deletes only the signed-in owner, revokes all sessions, and ends their shared space", async () => {
    const id = "delete-owner";
    const partner = "delete-partner";
    await seed(id);
    await seed(partner);
    const relationship = await db.relationship.create({
      data: { members: { create: [{ userId: id }, { userId: partner }] } },
    });
    await db.privateReflection.create({ data: { ownerId: id, text: "Private test content" } });
    await db.privateReflection.create({ data: { ownerId: partner, text: "Keep me" } });
    await db.verification.create({
      data: { id: "delete-test-reset", identifier: "reset-password:fake", value: id, expiresAt: new Date(Date.now() + 3600000) },
    });
    await db.relationshipInvite.create({ data: { inviterId: partner, inviteeEmail: `${id.toUpperCase()}@example.test` } });

    expect((await attempt(id)).statusCode).toBe(204);
    expect(await db.user.findUnique({ where: { id } })).toBeNull();
    expect(await db.account.count({ where: { userId: id } })).toBe(0);
    expect(await db.session.count({ where: { userId: id } })).toBe(0);
    expect(await db.privateReflection.findUnique({ where: { ownerId: id } })).toBeNull();
    expect(await db.verification.count({ where: { value: id } })).toBe(0);
    expect(await db.relationshipInvite.count({ where: { inviterId: partner } })).toBe(0);
    expect(await db.user.findUnique({ where: { id: partner } })).not.toBeNull();
    expect(await db.privateReflection.findUnique({ where: { ownerId: partner } })).toMatchObject({ text: "Keep me" });
    expect(await db.relationship.findUnique({ where: { id: relationship.id } })).toMatchObject({ status: "ENDED" });
    expect((await app.inject({
      url: "/api/profile", headers: { cookie: cookie(`${id}-token-2`) },
    })).statusCode).toBe(401);
    expect((await app.inject({
      url: "/api/profile", headers: { cookie: cookie(`${partner}-token-2`) },
    })).statusCode).toBe(200);
  });

  it("rejects missing sessions, other origins, stale owners, and unexpected body fields", async () => {
    const id = "delete-checks";
    await seed(id);
    expect((await attempt(id, { authenticated: false })).statusCode).toBe(401);
    expect((await attempt(id, { requestOrigin: "https://example.test" })).statusCode).toBe(403);
    expect((await attempt(id, { requestOrigin: "" })).statusCode).toBe(403);
    expect((await attempt(id, { owner: "different-account" })).statusCode).toBe(409);
    expect((await attempt(id, { body: { password, id: "different-account" } })).statusCode).toBe(400);
    expect(await db.session.count({ where: { userId: id } })).toBe(2);
  });

  it("checks the password and persists rate limiting even when confirmation fails", async () => {
    const id = "delete-throttled";
    await seed(id);
    for (let i = 0; i < 5; i++) {
      expect((await attempt(id, { body: { password: "wrong-password" } })).statusCode).toBe(403);
    }
    const limited = await attempt(id);
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    expect(await db.user.findUnique({ where: { id } })).not.toBeNull();
  });

  it("does not delete accounts or cascade safety reports that need manual review", async () => {
    const id = "delete-reported";
    const reporter = "delete-reporter";
    await seed(id);
    await seed(reporter);
    const report = await db.discoveryReport.create({
      data: { reportedUserId: id, reporterId: reporter, reason: "Test safety report" },
    });
    expect((await attempt(id)).statusCode).toBe(409);
    expect(await db.discoveryReport.findUnique({ where: { id: report.id } })).not.toBeNull();
    expect(await db.session.count({ where: { userId: id } })).toBe(2);
  });

  it("keeps photo storage references intact pending manual review", async () => {
    const id = "delete-photo-owner";
    await seed(id);
    const profile = await db.discoveryProfile.create({ data: { ownerId: id, draft: { revision: 0 } } });
    const photo = await db.discoveryPhoto.create({
      data: {
        ownerId: id, profileId: profile.id, requestId: "delete-test-photo",
        payloadHash: "a".repeat(64), expectedRevision: 0, publicId: "test-only/photo",
      },
    });
    expect((await attempt(id)).statusCode).toBe(409);
    expect(await db.discoveryPhoto.findUnique({ where: { id: photo.id } }))
      .toMatchObject({ publicId: "test-only/photo" });
    expect(await db.user.findUnique({ where: { id } })).not.toBeNull();
  });
});
