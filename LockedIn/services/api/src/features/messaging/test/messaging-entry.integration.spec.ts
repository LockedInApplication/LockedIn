import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson } from "../../discovery/test/discovery.fixtures.js";
vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("shared space messaging entry", () => {
  let app: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  const oldEnv = { ...process.env };
  beforeAll(async () => { process.env.SHARED_MESSAGING_ENABLED = "true"; app = await (await import("../../../app.js")).buildServer(); });
  afterAll(async () => { process.env = oldEnv; await app?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });
  it("projects only the actor's existing conversation without automatically sending a message", async () => {
    const a = await createPerson(), b = await createPerson(), outsider = await createPerson(), { prisma } = await import("../../../lib/prisma.js");
    const i = await prisma.relationshipInvite.create({ data: { inviterId: a.id, inviteeId: b.id, expiresAt: new Date(Date.now()+60000) } });
    const accepted = await (await import("../../invitations/invitation.service.js")).acceptInvitation(i.id,a.id,b.id); if (!accepted.ok) throw Error(accepted.error);
    const overview = async (cookie: string) => (await app.inject({ url: "/api/journey/overview", headers: { cookie } })).json();
    expect((await overview(a.cookie)).messaging).toEqual({ enabled: true, conversationId: accepted.relationship.id });
    expect((await overview(b.cookie)).messaging).toEqual({ enabled: true, conversationId: accepted.relationship.id });
    expect((await overview(outsider.cookie)).messaging).toEqual({ enabled: true, conversationId: null });
    expect(await prisma.discoveryMessage.count({ where: { conversationId: accepted.relationship.id } })).toBe(0);
    process.env.SHARED_MESSAGING_ENABLED = "false";
    expect((await overview(a.cookie)).messaging).toEqual({ enabled: false, conversationId: null });
    process.env.SHARED_MESSAGING_ENABLED = "true";
    await prisma.relationship.update({ where: { id: accepted.relationship.id }, data: { status: "ENDED" } });
    expect((await overview(a.cookie)).messaging.conversationId).toBeNull();
  });
});
