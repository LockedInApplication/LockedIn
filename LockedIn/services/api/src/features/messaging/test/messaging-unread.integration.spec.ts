import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson } from "../../discovery/test/discovery.fixtures.js";
import { connectionFixtures } from "../../discovery/test/discovery-connection.fixtures.js";

vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("unread chat activity", () => {
  const oldEnv = { ...process.env };
  let app: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  beforeAll(async () => {
    process.env.SHARED_MESSAGING_ENABLED = "true";
    process.env.DISCOVERY_CHAT_ENABLED = "true";
    app = await (await import("../../../app.js")).buildServer();
    await app.listen({ host: "127.0.0.1", port: 0 });
  });
  afterAll(async () => {
    process.env = oldEnv;
    await app?.close();
    await (await import("../../../lib/prisma.js")).prisma.$disconnect();
  });
  const call = (actor: { id: string; cookie: string }, path: string, payload?: object) => app.inject({
    method: payload ? "POST" : "GET", url: `/api/messaging/${path}`,
    headers: { cookie: actor.cookie, origin: "http://localhost:3001", "x-messaging-owner": actor.id }, ...(payload ? { payload } : {}),
  });
  const send = (actor: { id: string; cookie: string }, id: string, input = { text: "Private message", requestId: randomUUID() }) =>
    call(actor, `conversations/${id}/messages`, input);

  it("counts a direct chat once and acknowledges only the sequence displayed", async () => {
    const a = await createPerson(), b = await createPerson(), outsider = await createPerson();
    const { prisma } = await import("../../../lib/prisma.js");
    const { ensureRelationshipConversation } = await import("../messaging-conversation.service.js");
    const relationship = await prisma.relationship.create({ data: { members: { create: [{ userId: a.id }, { userId: b.id }] } } });
    const { id } = await prisma.$transaction(tx => ensureRelationshipConversation(tx, relationship.id));
    const input = { text: "Private first", requestId: randomUUID() };
    const first = (await send(a, id, input)).json().value;
    expect((await send(a, id, input)).json().value.id).toBe(first.id);
    const badge = await call(b, "unread");
    expect(badge.statusCode).toBe(200);
    expect(badge.json().value).toEqual({ count: 1, items: [{ conversationId: id, discoveryConnectionId: null }] });
    expect(badge.body).not.toContain(input.text);
    expect((await call(a, "unread")).json().value.count).toBe(0);
    expect((await call(outsider, "unread")).json().value.count).toBe(0);
    const second = (await send(a, id)).json().value;
    const read = `conversations/${id}/read`;
    expect((await call(outsider, read, { through: second.sequence })).statusCode).toBe(404);
    expect((await call(b, read, { through: "9223372036854775807" })).statusCode).toBe(404);
    expect((await call(b, read, { through: first.sequence })).json().value.through).toBe(first.sequence);
    expect((await call(b, "unread")).json().value.count).toBe(1);
    expect((await call(b, read, { through: second.sequence })).json().value.through).toBe(second.sequence);
    expect((await call(b, read, { through: first.sequence })).json().value.through).toBe(second.sequence);
    expect((await call(b, "unread")).json().value.count).toBe(0);
  });

  it("routes accepted Discovery chats even with neutral chat off and excludes blocked chats", async () => {
    const f = connectionFixtures(app), a = await f.person(), b = await f.person();
    const id = (await f.send(a,b)).json().value.id as string;
    await f.request(b,"POST",`/api/discovery/connections/${id}/accept`,{});
    const message = (await send(a,id)).json().value;
    process.env.SHARED_MESSAGING_ENABLED = "false";
    try {
      expect((await call(b,"unread")).json().value.items).toEqual([{ conversationId: id, discoveryConnectionId: id }]);
      expect((await call(b,`conversations/${id}/read`,{ through: message.sequence })).statusCode).toBe(200);
      expect((await call(b,"unread")).json().value.count).toBe(0);
    } finally { process.env.SHARED_MESSAGING_ENABLED = "true"; }
    await send(a,id);
    expect((await call(b,`conversations/${id}/block`,{})).statusCode).toBe(200);
    expect((await call(b,"unread")).json().value.count).toBe(0);
  });

  it("does not alert for messages received while activity alerts were off", async () => {
    const a = await createPerson(), b = await createPerson();
    const { prisma } = await import("../../../lib/prisma.js");
    const { ensureRelationshipConversation } = await import("../messaging-conversation.service.js");
    const relationship = await prisma.relationship.create({ data: { members: { create: [{ userId: a.id }, { userId: b.id }] } } });
    const { id } = await prisma.$transaction(tx => ensureRelationshipConversation(tx, relationship.id));
    await prisma.user.update({ where: { id: b.id }, data: { inAppActivity: false } });
    expect((await send(a,id)).statusCode).toBe(200);
    expect((await call(b,"unread")).json().value.count).toBe(0);
    expect((await call(b,`conversations/${id}/messages`)).json().value.items).toHaveLength(1);
    await prisma.user.update({ where: { id: b.id }, data: { inAppActivity: true } });
    expect((await call(b,"unread")).json().value.count).toBe(0);
    expect((await send(a,id)).statusCode).toBe(200);
    expect((await call(b,"unread")).json().value.count).toBe(1);
  });
});
