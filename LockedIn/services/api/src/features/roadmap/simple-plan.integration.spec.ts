import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson } from "../discovery/test/discovery.fixtures.js";

vi.mock("../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("day-one roadmap and mandatory verification", () => {
  let app: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
  let db: typeof import("../../lib/prisma.js").prisma;
  let settings: typeof import("../../config/env.js").env;
  beforeAll(async () => {
    ({ env: settings } = await import("../../config/env.js"));
    ({ prisma: db } = await import("../../lib/prisma.js"));
    app = await (await import("../../app.js")).buildServer();
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });
  const get = (cookie: string, url: string) => app.inject({ url, headers: { cookie } });
  const post = (cookie: string, url: string, payload: object, owner?: string) => app.inject({ method: "POST", url, payload,
    headers: { cookie, origin: "http://localhost:3001", "x-roadmap-owner": owner ?? decodeURIComponent(cookie).split("token-")[1]?.split(".")[0] ?? "" } });

  it("agrees on the current version without a check-in, handles retries and resolves only the correct alert", async () => {
    const a = await createPerson(), b = await createPerson(), outsider = await createPerson();
    const space = await db.relationship.create({ data: { members: { create: [{ userId: a.id }, { userId: b.id }] } } });
    const path = `/api/journey/relationships/${space.id}/plans`;
    const offer = { requestId: randomUUID(), plan: { title: "Cook together", day: null, note: "Pasta night" } };
    expect((await post(outsider.cookie, path, offer)).statusCode).toBe(404);
    expect((await post(b.cookie, path, offer, a.id)).statusCode).toBe(409);
    const created = await post(a.cookie, path, offer);
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    expect((await post(a.cookie, path, offer)).json()).toEqual({ id });
    expect((await post(a.cookie, path, { ...offer, plan: { title: "Different plan" } })).statusCode).toBe(409);
    const overview = (cookie: string) => get(cookie, "/api/journey/overview");
    expect((await overview(a.cookie)).json()).toMatchObject({ session: null, simplePlans: [{ title: "Cook together", yours: true, status: "PENDING" }] });
    expect((await overview(b.cookie)).json()).toMatchObject({ session: null, simplePlans: [{ id, yours: false }] });
    expect((await overview(outsider.cookie)).json().simplePlans).toEqual([]);
    const action = { requestId: randomUUID(), action: "accept", version: 1 };
    expect((await post(a.cookie, `${path}/${id}`, action)).statusCode).toBe(409);
    expect((await post(b.cookie, `${path}/${id}`, { ...action, requestId: randomUUID(), action: "counter", plan: { title: "Cook on Sunday", day: "2026-11-29" } })).statusCode).toBe(200);
    expect((await post(a.cookie, `${path}/${id}`, action)).statusCode).toBe(409);
    const firstEvent = await db.notification.findFirstOrThrow({ where: { recipientId: b.id, entityId: id, kind: "ROADMAP_PLAN_REPLY" } });
    expect(firstEvent.resolvedAt).not.toBeNull();
    expect(await db.notification.count({ where: { entityId: id, kind: "ROADMAP_PLAN_REPLY", resolvedAt: null, recipientId: a.id } })).toBe(1);
    const revised = { ...action, version: 2 };
    const { notificationFingerprint } = await import("../notifications/notification.repository.js");
    const beforeAccept = await notificationFingerprint(b.id);
    const responses = await Promise.all([post(a.cookie, `${path}/${id}`, revised), post(a.cookie, `${path}/${id}`, revised)]);
    expect(responses.map(response => response.statusCode)).toEqual([200, 200]);
    expect(await notificationFingerprint(b.id)).not.toBe(beforeAccept);
    const accepted = (await overview(b.cookie)).json().simplePlans[0];
    expect(accepted).toMatchObject({ title: "Cook on Sunday", day: "2026-11-29", version: 3, status: "ACCEPTED" });
    expect((await post(a.cookie, `${path}/${id}`, { requestId: randomUUID(), action: "pass", version: 2 })).statusCode).toBe(409);
    expect((await post(b.cookie, `${path}/${id}`, { requestId: randomUUID(), action: "done", version: 3 })).statusCode).toBe(200);
    expect((await overview(b.cookie)).json().simplePlans[0]).toMatchObject({ status: "DONE", resolvedBy: "You" });
    expect(await db.notification.count({ where: { entityId: id, kind: "ROADMAP_PLAN_REPLY", resolvedAt: null } })).toBe(0);
    expect(await db.roadmapPlan.count({ where: { relationshipId: space.id } })).toBe(1);
    expect(await db.intentionSession.count({ where: { relationshipId: space.id } })).toBe(0);
    const add = async () => (await post(a.cookie, path, { ...offer, requestId: randomUUID() })).json().id as string;
    const passed = await add();
    expect((await post(b.cookie, `${path}/${passed}`, { requestId: randomUUID(), action: "pass", version: 1 })).statusCode).toBe(200);
    const withdrawn = await add();
    expect((await post(a.cookie, `${path}/${withdrawn}`, { requestId: randomUUID(), action: "withdraw", version: 1 })).statusCode).toBe(200);
    await db.user.update({ where: { id: b.id }, data: { inAppActivity: false } });
    const restricted = await add();
    expect(await db.notification.findFirst({ where: { entityId: restricted, recipientId: b.id } })).toMatchObject({ suppressed: true });
    const { lockDiscoveryUsers } = await import("../discovery/discovery-locks.js");
    const { blockContactUnderLock } = await import("../invitations/invitation-restrictions.service.js");
    await db.$transaction(async tx => { await lockDiscoveryUsers(tx, [a.id, b.id]); await blockContactUnderLock(tx, b.id, a.id, "Partner"); });
    expect(await db.roadmapPlan.findUnique({ where: { id: restricted } })).toMatchObject({ status: "CANCELED", resolvedById: null });
    expect(await db.notification.count({ where: { entityId: restricted, resolvedAt: null } })).toBe(0);
    expect((await overview(a.cookie)).json().simplePlans).toBeNull();
    expect((await post(a.cookie, path, { ...offer, requestId: randomUUID() })).statusCode).toBe(404);
    await db.relationship.update({ where: { id: space.id }, data: { status: "ENDED" } });
    expect((await post(b.cookie, path, offer)).statusCode).toBe(404);
  });

  it("blocks existing unverified sessions at the API while allowing account verification entry", async () => {
    const account = await createPerson();
    const previous = settings.REQUIRE_EMAIL_VERIFICATION;
    settings.REQUIRE_EMAIL_VERIFICATION = "true";
    try {
      await db.user.update({ where: { id: account.id }, data: { emailVerified: false } });
      for (const path of ["/api/journey/overview", "/api/journey/atlas/unknown", "/api/journey/notifications/stream", "/api/messaging/unread", "/api/discovery/me"]) {
        const denied = await get(account.cookie, path);
        expect(denied.statusCode, path).toBe(403);
        expect(denied.json().code).toBe("EMAIL_NOT_VERIFIED");
      }
      expect((await post(account.cookie, "/api/auth/update-user", { name: "Attempt" })).json().code).toBe("EMAIL_NOT_VERIFIED");
      expect((await get(account.cookie, "/api/auth/get-session")).json().user.emailVerified).toBe(false);
      await db.user.update({ where: { id: account.id }, data: { emailVerified: true } });
      expect((await get(account.cookie, "/api/journey/overview")).statusCode).toBe(200);
    } finally { settings.REQUIRE_EMAIL_VERIFICATION = previous; }
  });
});
