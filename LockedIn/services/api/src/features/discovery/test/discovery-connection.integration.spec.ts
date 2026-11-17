import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures, publicDraft } from "./discovery-connection.fixtures.js";

vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("separate discovery invitation lifecycle", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  let f: ReturnType<typeof connectionFixtures>;
  const oldEnv = { ...process.env };
  beforeAll(async () => { server = await (await import("../../../app.js")).buildServer(); await server.listen({ port: 0, host: "127.0.0.1" }); f = connectionFixtures(server); });
  afterAll(async () => { process.env = oldEnv; await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });

  it("freezes chosen public identity/question/hello and accepts without creating a deep space", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const a = await f.person(), b = await f.person(), outsider = await f.person();
    const sent = await f.send(a, b); expect(sent.statusCode).toBe(200);
    const connection = sent.json().value;
    expect(connection.state).toBe("PENDING");
    expect(connection.topic.key).toBe("support");
    expect(connection.hello).toBe("Hello there");
    expect(connection.senderSnapshot).toEqual({ publicName: "Chosen alias", avatarPreset: "leaf" });
    await prisma.discoveryProfile.update({ where: { id: a.profileId }, data: { publishedSnapshot: { ...publicDraft, publicName: "Edited alias" } } });
    const read = await f.request(b, "GET", `/api/discovery/connections/${connection.id}`);
    expect(read.json().value.senderSnapshot.publicName).toBe("Chosen alias");
    expect(read.json().value.canAccept).toBe(true);
    expect((await f.request(outsider, "GET", `/api/discovery/connections/${connection.id}`)).statusCode).toBe(404);
    expect((await f.request(a, "POST", `/api/discovery/connections/${connection.id}/accept`, {})).statusCode).toBe(409);
    const accepted = await f.request(b, "POST", `/api/discovery/connections/${connection.id}/accept`, {});
    expect(accepted.json().value.state).toBe("ACCEPTED");
    expect(await prisma.relationshipMember.count({ where: { userId: { in: [a.id, b.id] } } })).toBe(0);
    expect(JSON.stringify(read.json())).not.toMatch(/PRIVATE AUTH NAME|@example|ownerId.*draft|publishedSnapshot|blockedId/);
  });

  it("returns idempotent attempts before quota, even after terminal close; a new attempt has a new identity", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const a = await f.person(), b = await f.person(), key = randomUUID();
    const sent = await f.send(a, b, key); expect(sent.statusCode).toBe(200);
    const id = sent.json().value.id;
    await f.request(a, "POST", `/api/discovery/connections/${id}/withdraw`, {});
    await prisma.discoveryThrottle.updateMany({ where: { userId: a.id, action: { startsWith: "invite:" } }, data: { count: 999 } });
    const replay = await f.send(a, b, key);
    expect(replay.statusCode).toBe(200); expect(replay.json().value.id).toBe(id); expect(replay.json().value.state).toBe("WITHDRAWN");
    await prisma.discoveryThrottle.deleteMany({ where: { userId: a.id } });
    const next = await f.send(a, b); expect(next.statusCode).toBe(200); expect(next.json().value.id).not.toBe(id);
    expect(next.json().value.ownDraft).toBeNull(); expect(next.json().value.readiness.mine).toBe(false);
    const c = await f.person();
    expect((await f.send(a, c, key)).statusCode).toBe(409);
  });

  it("lets a compatible candidate reply only to the currently published prompt through an accept-only starter", async () => {
    const a = await f.person(), b = await f.person();
    const endpoint = "/api/discovery/connections";
    const payload = { targetProfileId: b.profileId, topicKey: "profile_prompt", expectedPromptAnswer: "Make the time.", hello: "I like your answer.", requestId: randomUUID() };
    const save = await f.request(b, "PUT", "/api/discovery/profile", { ...publicDraft, intention: "OPEN_TO_LONG_TERM", promptAnswer: "  Make the time.  ", revision: 1 });
    expect(save.statusCode).toBe(200);
    expect((await f.request(a, "POST", endpoint, payload)).statusCode).toBe(409);
    expect((await f.request(b, "POST", "/api/discovery/profile/publish", { draftRevision: 2, adultAttested: true })).statusCode).toBe(200);
    expect((await f.request(a, "POST", endpoint, { ...payload, hello: " " })).statusCode).toBe(400);
    expect((await f.request(a, "POST", endpoint, { ...payload, expectedPromptAnswer: "Out of date" })).statusCode).toBe(409);
    const sent = await f.request(a, "POST", endpoint, payload);
    expect(sent.statusCode).toBe(200);
    const { id } = sent.json().value;
    const incoming = await f.request(b, "GET", `${endpoint}/${id}`);
    expect(incoming.json().value).toMatchObject({ state: "PENDING", topic: { key: "profile_prompt" }, hello: payload.hello, canAccept: true, canShare: false });
    expect(JSON.stringify(incoming.json())).not.toContain(payload.expectedPromptAnswer);
    expect((await f.request(b, "POST", `${endpoint}/${id}/accept`, {})).json().value.state).toBe("ACCEPTED");
  });

  it("quiet directional decline cooldown is fixed, permits reverse invite and ends at the boundary", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const a = await f.person(), b = await f.person();
    const first = await f.send(a, b); expect(first.statusCode).toBe(200);
    const id = first.json().value.id;
    await f.request(b, "POST", `/api/discovery/connections/${id}/decline`, {});
    const before = await prisma.discoveryConnection.findUniqueOrThrow({ where: { id } });
    expect((await f.send(a, b)).statusCode).toBe(409);
    await f.request(b, "POST", `/api/discovery/connections/${id}/decline`, {});
    expect((await prisma.discoveryConnection.findUniqueOrThrow({ where: { id } })).declinedAt).toEqual(before.declinedAt);
    const reverse = await f.send(b, a); expect(reverse.statusCode).toBe(200);
    await f.request(b, "POST", `/api/discovery/connections/${reverse.json().value.id}/withdraw`, {});
    await prisma.discoveryConnection.update({ where: { id }, data: { declinedAt: new Date(Date.now() - 7 * 86400000) } });
    expect((await f.send(a, b)).statusCode).toBe(200);
  });

  it("expires pending attempts consistently without cooldown and permits read-only history when admission is off", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const a = await f.person(), b = await f.person();
    const sent = await f.send(a, b); expect(sent.statusCode).toBe(200);
    const id = sent.json().value.id;
    await prisma.discoveryConnection.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1) } });
    const candidates = await f.request(a, "GET", "/api/discovery/candidates?areaId=pilot-city");
    expect(candidates.json().value.items.map((item: { id: string }) => item.id)).toContain(b.profileId);
    expect((await f.request(b, "GET", "/api/discovery/connections")).json().value.items.find((row: { id: string }) => row.id === id).state).toBe("EXPIRED");
    const accept = await f.request(b, "POST", `/api/discovery/connections/${id}/accept`, {});
    expect(accept.json().value.state).toBe("EXPIRED");
    expect((await f.send(a, b)).statusCode).toBe(200);
    process.env.DISCOVERY_ENABLED = "false";
    const list = await f.request(b, "GET", "/api/discovery/connections"); expect(list.statusCode).toBe(200);
    expect(list.json().value.items.some((row: {id: string}) => row.id === id)).toBe(true);
    expect((await f.send(a, b)).statusCode).toBe(403);
    f.configure();
  });

  it("pause leaves pending acceptance available; blocks and removed eligibility stop acceptance", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const a = await f.person(), b = await f.person();
    const sent = await f.send(a, b); expect(sent.statusCode).toBe(200);
    const id = sent.json().value.id;
    await prisma.discoveryProfile.update({ where: { id: b.profileId }, data: { pausedAt: new Date() } });
    expect((await f.request(b, "POST", `/api/discovery/connections/${id}/accept`, {})).json().value.state).toBe("ACCEPTED");
    expect((await f.request(a, "POST", `/api/discovery/connections/${id}/close`, {})).json().value.state).toBe("CLOSED");
    expect((await f.send(a, b)).statusCode).toBe(404);
    await prisma.discoveryProfile.update({ where: { id: b.profileId }, data: { pausedAt: null } });
    const second = await f.send(a, b); expect(second.statusCode).toBe(200);
    await prisma.invitationBlock.create({ data: { blockerId: b.id, blockedId: a.id } });
    expect((await f.request(b, "POST", `/api/discovery/connections/${second.json().value.id}/accept`, {})).statusCode).toBe(409);
    await prisma.invitationBlock.deleteMany({ where: { blockerId: b.id } });
    process.env.DISCOVERY_PILOT_USER_IDS = a.id;
    expect((await f.request(b, "POST", `/api/discovery/connections/${second.json().value.id}/accept`, {})).statusCode).toBe(409);
    expect((await f.request(b, "POST", `/api/discovery/connections/${second.json().value.id}/decline`, {})).statusCode).toBe(200);
    f.configure();
  });

  it("rejects client identities, unexpected fields, invalid topics and oversize introductions", async () => {
    const a = await f.person(), b = await f.person();
    for (const extra of [{ hello: "x".repeat(281) }, { topicKey: "invented" }, { inviterId: b.id }, { requestId: "bad" }]) {
      expect((await f.request(a, "POST", "/api/discovery/connections", { targetProfileId: b.profileId, topicKey: "support", hello: "Hello", requestId: randomUUID(), ...extra })).statusCode).toBe(400);
    }
    expect((await f.send(a, a)).statusCode).toBe(404);
  });
});
