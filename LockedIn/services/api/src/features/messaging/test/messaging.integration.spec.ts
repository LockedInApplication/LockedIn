import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures } from "../../discovery/test/discovery-connection.fixtures.js";
import { createPerson } from "../../discovery/test/discovery.fixtures.js";
vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("neutral messaging API", () => {
  let app: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  let f: ReturnType<typeof connectionFixtures>;
  const oldEnv = { ...process.env };
  beforeAll(async () => {
    process.env.SHARED_MESSAGING_ENABLED = "true"; process.env.DISCOVERY_CHAT_ENABLED = "true";
    app = await (await import("../../../app.js")).buildServer();
    await app.listen({ port: 0, host: "127.0.0.1" }); f = connectionFixtures(app);
  });
  afterAll(async () => { process.env = oldEnv; await app?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });
  const request = (a: { id: string; cookie: string }, method: "GET" | "POST", url: string, payload?: object, headers: object = {}) => app.inject({ method, url, headers: { cookie: a.cookie, origin: "http://localhost:3001", "x-messaging-owner": a.id, ...headers }, ...(payload ? { payload } : {}) });
  async function thread() {
    const a = await f.person(), b = await f.person();
    const sent = await f.send(a, b), id = sent.json().value.id as string;
    expect((await f.request(b, "POST", `/api/discovery/connections/${id}/accept`, {})).statusCode).toBe(200);
    // An upgraded old client associates the conversation even before backfill.
    expect((await f.request(a, "GET", `/api/discovery/connections/${id}/messages`)).statusCode).toBe(200);
    return { a, b, id, url: `/api/messaging/conversations/${id}` };
  }
  it("shares receipts across routes, old nullable associations and concurrent retries without copying", async () => {
    const { a, b, id, url } = await thread();
    const input = { text: "One message", requestId: randomUUID() };
    const replies = await Promise.all([f.request(a, "POST", `/api/discovery/connections/${id}/messages`, input), request(a, "POST", `${url}/messages`, input)]);
    expect(replies.map(r => r.statusCode)).toEqual([200, 200]);
    expect(replies[0]!.json().value).toEqual(replies[1]!.json().value);
    expect((await request(a, "POST", `${url}/messages`, { ...input, text: "Changed" })).statusCode).toBe(409);
    const { prisma } = await import("../../../lib/prisma.js");
    const late = await prisma.discoveryMessage.create({ data: { connectionId: id, senderId: a.id, requestId: randomUUID(), text: "Old writer" } });
    expect((await request(a, "POST", `${url}/messages`, { text: late.text, requestId: late.requestId })).json().value.id).toBe(late.id);
    expect(await prisma.discoveryMessage.count({ where: { connectionId: id } })).toBe(2);
    const page = await request(b, "GET", `${url}/messages`);
    expect(page.headers["cache-control"]).toBe("private, no-store");
    expect(page.json().value.items.map((m: { text: string }) => m.text)).toEqual(["One message", "Old writer"]);
  });
  it("supports verified direct members without Discovery and withholds unavailable transcripts and partner moderation state", async () => {
    const a = await createPerson(), b = await createPerson(), outsider = await createPerson();
    const { prisma } = await import("../../../lib/prisma.js");
    const r = await prisma.relationship.create({ data: { members: { create: [a, b].map(u => ({ userId: u.id })) } } });
    const { lockDiscoveryUsers } = await import("../../discovery/discovery-locks.js");
    const { ensureRelationshipConversation } = await import("../messaging-conversation.service.js");
    const c = await prisma.$transaction(async tx => { await lockDiscoveryUsers(tx, [a.id, b.id]); return ensureRelationshipConversation(tx, r.id); });
    const url = `/api/messaging/conversations/${c.id}`;
    expect((await request(a, "POST", `${url}/messages`, { text: "Direct", requestId: randomUUID() })).statusCode).toBe(200);
    const metadata = await request(a, "GET", url);
    expect(metadata.json().value).toMatchObject({ id: c.id, canChat: true, partner: { publicName: "Your partner" } });
    expect(JSON.stringify(metadata.json())).not.toContain(b.email);
    expect(metadata.json().value.profileConnectionId).toBeUndefined();
    expect((await request(a, "GET", `/api/messaging/relationships/${r.id}/conversation`)).json().value.id).toBe(c.id);
    expect((await request(outsider, "GET", url)).statusCode).toBe(404);
    expect((await request(outsider, "POST", `${url}/messages`, { text: "No", requestId: randomUUID() })).statusCode).toBe(404);
    await prisma.user.update({ where: { id: a.id }, data: { emailVerified: false } });
    expect((await request(a, "GET", url)).json().value).toMatchObject({ canChat: false, unavailableReason: "VERIFY_EMAIL" });
    expect((await request(b, "GET", url)).json().value).toMatchObject({ canChat: false, unavailableReason: "UNAVAILABLE" });
    expect((await request(a, "GET", `${url}/messages`)).statusCode).toBe(404);
    await prisma.user.update({ where: { id: a.id }, data: { emailVerified: true } });
    await prisma.relationship.update({ where: { id: r.id }, data: { status: "ENDED" } });
    expect((await request(b, "GET", `${url}/messages`)).statusCode).toBe(404);
  });
  it("enforces strict validation, trusted origin, owner binding, pagination, quotas and rollout", async () => {
    const { a, b, id, url } = await thread(), input = { text: "Hello", requestId: randomUUID() };
    for (const payload of [{ ...input, extra: true }, { ...input, text: " " }, { ...input, text: "x".repeat(2001) }, { ...input, text: "a\u0000b" }]) expect((await request(a, "POST", `${url}/messages`, payload)).statusCode).toBe(400);
    expect((await request(a, "POST", `${url}/messages`, input, { origin: "https://evil.test" })).statusCode).toBe(403);
    expect((await request(a, "POST", `${url}/messages`, input, { "x-messaging-owner": b.id })).statusCode).toBe(409);
    for (const query of ["?before=0", "?before=9223372036854775808", "?extra=true"]) expect((await request(a, "GET", `${url}/messages${query}`)).statusCode).toBe(400);
    const { prisma } = await import("../../../lib/prisma.js");
    await prisma.discoveryMessage.createMany({ data: Array.from({ length: 31 }, (_, i) => ({ connectionId: id, senderId: a.id, requestId: randomUUID(), text: `Message ${i}` })) });
    const latest = (await request(a, "GET", `${url}/messages`)).json().value;
    expect(latest.items).toHaveLength(30); expect(latest.items[0].text).toBe("Message 1");
    const older = (await request(a, "GET", `${url}/messages?before=${latest.nextCursor}`)).json().value;
    expect(older.items.map((m: { text: string }) => m.text)).toEqual(["Message 0"]);
    await prisma.discoveryThrottle.create({ data: { userId: a.id, action: "chat:60000", windowStart: new Date(Math.floor(Date.now() / 60000) * 60000), count: 20 } });
    expect((await request(a, "POST", `${url}/messages`, input)).statusCode).toBe(429);
    process.env.SHARED_MESSAGING_ENABLED = "false";
    expect((await request(a, "GET", `${url}/messages`)).statusCode).toBe(404);
    expect((await f.request(a, "GET", `/api/discovery/connections/${id}/messages`)).statusCode).toBe(200);
    process.env.SHARED_MESSAGING_ENABLED = "true";
    await prisma.discoveryConnection.update({ where: { id }, data: { closedAt: new Date() } });
    expect((await request(a, "GET", `${url}/messages`)).statusCode).toBe(404);
  });
});
