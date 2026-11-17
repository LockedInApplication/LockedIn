import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures } from "./discovery-connection.fixtures.js";
vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("retired private starter drafts", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>, f: ReturnType<typeof connectionFixtures>;
  const oldEnv = { ...process.env };
  beforeAll(async () => { server = await (await import("../../../app.js")).buildServer(); await server.listen({ port: 0, host: "127.0.0.1" }); f = connectionFixtures(server); });
  afterAll(async () => { process.env = oldEnv; await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });
  it("never returns historical private drafts and rejects retired writes without changing stored data", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const a = await f.person(), b = await f.person(), outsider = await f.person();
    const invite = await f.send(a, b); expect(invite.statusCode).toBe(200);
    const id = invite.json().value.id, url = `/api/discovery/connections/${id}`;
    expect((await f.request(b, "POST", `${url}/accept`, {})).statusCode).toBe(200);
    const draft = await prisma.discoveryDraft.create({ data: { connectionId: id, ownerId: a.id, text: "HISTORICAL PRIVATE WORDS" } });
    const shared = await prisma.discoverySharedResponse.create({ data: { connectionId: id, ownerId: a.id, text: "Previously shared", version: 1, requestId: randomUUID() } });
    const notificationCount = await prisma.notification.count({ where: { discoveryConnectionId: id } });
    for (const person of [a, b]) {
      const response = await f.request(person, "GET", url);
      expect(response.statusCode).toBe(200);
      expect(response.json().value).toMatchObject({ ownDraft: null, canShare: false, hello: "Hello there" });
      expect(JSON.stringify(response.json())).not.toContain(draft.text);
    }
    for (const person of [a, b, outsider]) {
      expect((await f.request(person, "PUT", `${url}/draft`, { text: "New draft", revision: 1 })).statusCode).toBe(404);
      expect((await f.request(person, "POST", `${url}/share`, { draftRevision: 1, requestId: randomUUID() })).statusCode).toBe(404);
    }
    expect((await f.request(outsider, "GET", url)).statusCode).toBe(404);
    expect(await prisma.discoveryDraft.findUnique({ where: { id: draft.id } })).toEqual(draft);
    expect(await prisma.discoverySharedResponse.findUnique({ where: { id: shared.id } })).toEqual(shared);
    expect(await prisma.notification.count({ where: { discoveryConnectionId: id } })).toBe(notificationCount);
  });
});
