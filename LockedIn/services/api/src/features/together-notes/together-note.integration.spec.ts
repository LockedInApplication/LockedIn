import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson } from "../discovery/test/discovery.fixtures.js";
import { notificationBroker } from "../notifications/notification.broker.js";

vi.mock("../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("private Together home notes", () => {
  let app: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
  let db: typeof import("../../lib/prisma.js").prisma;
  beforeAll(async () => {
    ({ prisma: db } = await import("../../lib/prisma.js"));
    app = await (await import("../../app.js")).buildServer();
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  type Person = Awaited<ReturnType<typeof createPerson>>;
  const origin = "http://localhost:3001";
  const path = (id: string) => `/api/journey/relationships/${id}/home-notes`;
  const headers = (actor: Person, overrides = {}) => ({ cookie: actor.cookie, origin, "x-together-owner": actor.id, ...overrides });
  const get = (actor: Person, id: string, overrides?: Record<string, string>) => app.inject({ url: path(id), headers: headers(actor, overrides) });
  const put = (actor: Person, id: string, payload: object, overrides?: Record<string, string>) => app.inject({
    method: "PUT", url: path(id), headers: headers(actor, overrides), payload,
  });
  async function createSpace(a: Person, b: Person, locked = true) {
    return (await db.relationship.create({ data: {
      ...(locked ? { directLockedInAt: new Date() } : {}), members: { create: [{ userId: a.id }, { userId: b.id }] },
    } })).id;
  }

  it("enforces membership, mutual lock-in and account-bound writes", async () => {
    const a = await createPerson(), b = await createPerson(), stranger = await createPerson();
    const space = await createSpace(a, b, false);
    expect((await app.inject({ url: path(space) })).statusCode).toBe(401);
    expect((await get(a, space)).statusCode).toBe(404);
    expect((await put(a, space, { text: "Too soon" })).statusCode).toBe(404);
    await db.relationship.update({ where: { id: space }, data: { directLockedInAt: new Date() } });
    expect((await get(stranger, space)).statusCode).toBe(404);
    expect((await put(stranger, space, { text: "Not mine" })).statusCode).toBe(404);
    expect((await get(a, space, { "x-together-owner": b.id })).statusCode).toBe(409);
    expect((await put(a, space, { text: "Wrong account" }, { "x-together-owner": b.id })).statusCode).toBe(409);
    expect((await put(a, space, { text: "Wrong origin" }, { origin: "https://unrelated.example" })).statusCode).toBe(403);
    for (const payload of [{ text: "  " }, { text: "a".repeat(281) }, { text: "Null\u0000character" }, { text: "Impersonation", authorId: b.id }]) {
      expect((await put(a, space, payload)).statusCode).toBe(400);
    }
    expect((await get(b, space)).json()).toEqual({ yours: null, partner: null });
  });

  it("shares a note without a photo or envelope and replaces only the author's own note", async () => {
    const a = await createPerson(), b = await createPerson();
    const space = await createSpace(a, b);
    const changed = vi.fn();
    const unsubscribe = notificationBroker.subscribe(b.id, changed);
    try {
      const sent = await put(a, space, { text: "  I loved our walk.  " });
      expect(sent.statusCode).toBe(200);
      expect(sent.headers["cache-control"]).toBe("private, no-store");
      const note = { text: "I loved our walk.", updatedAt: expect.any(String) };
      expect(sent.json()).toEqual({ yours: note, partner: null });
      const inbox = await get(b, space);
      expect(inbox.headers["cache-control"]).toBe("private, no-store");
      expect(inbox.json()).toEqual({ yours: null, partner: note });
      expect(changed.mock.calls).toEqual([[false]]);
      const retry = await put(a, space, { text: note.text });
      expect(retry.json()).toEqual(sent.json());
      expect(changed.mock.calls).toEqual([[false]]);

      expect((await put(b, space, { text: "Let’s go again." })).statusCode).toBe(200);
      expect((await put(a, space, { text: "Sunday sounds good." })).json()).toEqual({
        yours: { text: "Sunday sounds good.", updatedAt: expect.any(String) },
        partner: { text: "Let’s go again.", updatedAt: expect.any(String) },
      });
      expect(await db.togetherHomeNote.count({ where: { relationshipId: space } })).toBe(2);
      expect(await db.togetherEnvelope.count({ where: { relationshipId: space } })).toBe(0);
      expect(await db.togetherPhoto.count({ where: { relationshipId: space } })).toBe(0);
      expect(await db.notification.count({ where: { relationshipId: space } })).toBe(0);
    } finally { unsubscribe?.(); }
  });

  it("revokes access after block or leave and erases the pair's notes with account deletion", async () => {
    const a = await createPerson(), b = await createPerson();
    const space = await createSpace(a, b);
    expect((await put(a, space, { text: "Shared from Alex" })).statusCode).toBe(200);
    expect((await put(b, space, { text: "Shared from Sam" })).statusCode).toBe(200);
    const block = await db.invitationBlock.create({ data: { blockerId: b.id, blockedId: a.id } });
    expect((await get(a, space)).statusCode).toBe(404);
    expect((await get(b, space)).statusCode).toBe(404);
    expect((await put(a, space, { text: "Cannot share while blocked" })).statusCode).toBe(404);
    await db.invitationBlock.delete({ where: { id: block.id } });
    const left = await app.inject({ method: "POST", url: `/api/journey/relationships/${space}/leave`, headers: headers(a) });
    expect(left.statusCode).toBe(200);
    for (const person of [a, b]) {
      expect((await get(person, space)).statusCode).toBe(404);
      expect((await put(person, space, { text: "Cannot share after leaving" })).statusCode).toBe(404);
    }
    const { eraseAccountRows } = await import("../profile/account-deletion.data.js");
    await db.$transaction(tx => eraseAccountRows(tx, a.id, a.email));
    expect(await db.togetherHomeNote.count({ where: { relationshipId: space } })).toBe(0);
  });
});
