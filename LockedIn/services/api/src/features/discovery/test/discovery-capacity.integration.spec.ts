import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures } from "./discovery-connection.fixtures.js";
vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("serialized discovery capacity", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  let f: ReturnType<typeof connectionFixtures>;
  const oldEnv = { ...process.env };
  beforeAll(async () => { server = await (await import("../../../app.js")).buildServer(); await server.listen({ port: 0, host: "127.0.0.1" }); f = connectionFixtures(server); });
  afterAll(async () => { process.env = oldEnv; await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });
  it("opposing sends serialize one live pair, including mixed-case database-ordered IDs", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const a = await f.person(`Z-${randomUUID()}`), b = await f.person(`a-${randomUUID()}`);
    const responses = await Promise.all([f.send(a, b), f.send(b, a)]);
    expect(responses.map(r => r.statusCode).sort()).toEqual([200, 409]);
    const rows = await prisma.discoveryConnection.findMany({ where: { inviterId: { in: [a.id, b.id] }, state: "PENDING" } });
    expect(rows).toHaveLength(1);
    const ordered = await prisma.user.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: "asc" }, select: { id: true } });
    expect([rows[0]!.userLowId, rows[0]!.userHighId]).toEqual(ordered.map(r => r.id));
  });
  it("counts incoming and accepted starters, rejects the fourth from either side and frees terminal capacity", async () => {
    const actor = await f.person();
    const others = await Promise.all(Array.from({ length: 5 }, () => f.person()));
    const first = await f.send(actor, others[0]!); expect(first.statusCode).toBe(200);
    await f.request(others[0]!, "POST", `/api/discovery/connections/${first.json().value.id}/accept`, {});
    expect((await f.send(others[1]!, actor)).statusCode).toBe(200);
    expect((await f.send(actor, others[2]!)).statusCode).toBe(200);
    expect((await f.send(actor, others[3]!)).statusCode).toBe(409);
    expect((await f.send(others[4]!, actor)).statusCode).toBe(409);
    await f.request(actor, "POST", `/api/discovery/connections/${first.json().value.id}/close`, {});
    expect((await f.send(others[4]!, actor)).statusCode).toBe(200);
  });
  it("two senders racing for a recipient's last slot cannot exceed three", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const target = await f.person(), senders = await Promise.all(Array.from({ length: 4 }, () => f.person()));
    expect((await f.send(senders[0]!, target)).statusCode).toBe(200);
    expect((await f.send(senders[1]!, target)).statusCode).toBe(200);
    const raced = await Promise.all([f.send(senders[2]!, target), f.send(senders[3]!, target)]);
    expect(raced.map(r => r.statusCode).sort()).toEqual([200, 409]);
    expect(await prisma.discoveryConnection.count({ where: { OR: [{ userLowId: target.id }, { userHighId: target.id }], state: { in: ["PENDING", "ACCEPTED"] } } })).toBe(3);
  });
  it("acceptance racing withdraw/close cannot reopen terminal consent", async () => {
    const a = await f.person(), b = await f.person();
    const sent = await f.send(a, b); expect(sent.statusCode).toBe(200);
    const id = sent.json().value.id;
    await Promise.all([f.request(b, "POST", `/api/discovery/connections/${id}/accept`, {}), f.request(a, "POST", `/api/discovery/connections/${id}/close`, {})]);
    const state = (await f.request(b, "GET", `/api/discovery/connections/${id}`)).json().value.state;
    expect(state).toBe("CLOSED");
    expect((await f.request(b, "POST", `/api/discovery/connections/${id}/accept`, {})).json().value.state).toBe("CLOSED");
  });
  it("existing active deep space does not exclude opt-in starters", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const a = await f.person(), b = await f.person(), existing = await f.person();
    const relationship = await prisma.relationship.create({ data: { members: { create: [{ userId: a.id }, { userId: existing.id }] } } });
    const sent = await f.send(a, b); expect(sent.statusCode).toBe(200);
    expect((await f.request(b, "POST", `/api/discovery/connections/${sent.json().value.id}/accept`, {})).json().value.state).toBe("ACCEPTED");
    expect((await prisma.relationship.findUniqueOrThrow({ where: { id: relationship.id } })).status).toBe("ACTIVE");
  });
  it("expired pending starters free capacity without waiting for an acceptance or cleanup job", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const a = await f.person(), others = await Promise.all(Array.from({ length: 4 }, () => f.person()));
    for (const other of others.slice(0, 3)) expect((await f.send(a, other)).statusCode).toBe(200);
    await prisma.discoveryConnection.updateMany({ where: { inviterId: a.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect((await f.send(a, others[3]!)).statusCode).toBe(200);
  });
  it("accept racing withdrawal settles as accepted or withdrawn and never revives a withdrawal", async () => {
    const a = await f.person(), b = await f.person();
    const sent = await f.send(a, b); expect(sent.statusCode).toBe(200);
    const id = sent.json().value.id;
    await Promise.all([f.request(b, "POST", `/api/discovery/connections/${id}/accept`, {}), f.request(a, "POST", `/api/discovery/connections/${id}/withdraw`, {})]);
    const state = (await f.request(a, "GET", `/api/discovery/connections/${id}`)).json().value.state;
    expect(["ACCEPTED", "WITHDRAWN"]).toContain(state);
    expect((await f.request(b, "POST", `/api/discovery/connections/${id}/accept`, {})).json().value.state).toBe(state);
  });
});
