import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson } from "../discovery/test/discovery.fixtures.js";

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("Our Week Together (disposable database)", () => {
  const day = (iso: string) => new Date(iso + "Z");
  const now = day("2026-11-25T12:00:00");
  const atStart = day("2026-11-16T00:00:00");
  const beforeWeek = new Date(atStart.getTime() - 1);
  const afterWeek = day("2026-11-23T00:00:00");
  const late = new Date(afterWeek.getTime() - 1);
  const api = Fastify();
  let db: typeof import("../../lib/prisma.js").prisma;

  beforeAll(async () => {
    ({ prisma: db } = await import("../../lib/prisma.js"));
    await (await import("./our-week.routes.js")).registerOurWeekRoutes(api, () => now);
  });
  afterAll(async () => { await api.close(); await db?.$disconnect(); });

  async function pair(locked = true) {
    const [a, b] = await Promise.all([createPerson(), createPerson()]);
    const relationship = await db.relationship.create({ data: {
      directLockedInAt: locked ? beforeWeek : null,
      members: { create: [{ userId: a.id }, { userId: b.id }] },
    } });
    return { a, b, relationshipId: relationship.id };
  }

  function read(relationshipId: string, actor?: { id: string; cookie: string }, owner = actor?.id) {
    return api.inject({
      url: `/api/journey/relationships/${relationshipId}/our-week`,
      headers: actor ? { cookie: actor.cookie, "x-together-owner": owner } : {},
    });
  }

  it("returns the same shared highlights to both partners for the last completed week", async () => {
    const { a, b, relationshipId } = await pair();
    const outside = await pair();
    const stored = await db.roadmapPlan.create({ data: {
      relationshipId, proposerId: a.id, title: "Go to the museum", completedAt: late, status: "DONE", note: "Do not copy plan notes here",
    } });
    await db.roadmapPlan.createMany({ data: [
      { relationshipId, proposerId: a.id, title: "No known completion date", status: "DONE" },
      { relationshipId, proposerId: a.id, title: "Undone", status: "ACCEPTED" },
      { relationshipId, proposerId: a.id, title: "This week", status: "DONE", completedAt: afterWeek },
      { relationshipId, proposerId: a.id, title: "Too early", status: "DONE", completedAt: beforeWeek },
      { relationshipId: outside.relationshipId, proposerId: outside.a.id, title: "Other pair", status: "DONE", completedAt: late },
    ] });
    const envelope = await db.togetherEnvelope.create({ data: { relationshipId, title: "Museum day", tone: "LINEN" } });
    await db.togetherEnvelopeCaption.create({ data: { envelopeId: envelope.id, authorId: b.id, text: "No recap copy of captions" } });
    const photo = await db.togetherPhoto.create({ data: {
      relationshipId, uploaderId: b.id, envelopeId: envelope.id, title: "The light room", sourcePlanId: stored.id,
      width: 120, height: 90, jpeg: new Uint8Array([1, 2, 3]), createdAt: atStart,
    } });
    await db.togetherPhoto.createMany({ data: [
      { relationshipId, uploaderId: a.id, title: "Older photo", createdAt: beforeWeek, width: 120, height: 90, jpeg: new Uint8Array([1]) },
      { relationshipId, uploaderId: a.id, title: "This week’s photo", createdAt: afterWeek, width: 120, height: 90, jpeg: new Uint8Array([1]) },
    ] });
    await db.roomTalkTopic.createMany({ data: [
      { relationshipId, authorId: a.id, question: "Weekend ideas", discussedAt: atStart, phase: "DISCUSSED", takeaway: "Do not copy takeaways" },
      { relationshipId, authorId: b.id, question: "Old topic moved to another shelf", discussedAt: beforeWeek, phase: "DISCUSSED", updatedAt: late },
      { relationshipId, authorId: b.id, question: "We don’t know when", phase: "DISCUSSED", updatedAt: late },
      { relationshipId, authorId: b.id, question: "Not marked discussed", phase: "SAVED" },
    ] });
    const expected = {
      startsOn: "2026-11-16", endsOn: "2026-11-22",
      plans: [{ id: stored.id, title: "Go to the museum", completedAt: late.toISOString() }],
      memories: [{ id: photo.id, title: "The light room", sharedAt: atStart.toISOString(), envelopeTitle: "Museum day" }],
      topic: { title: "Weekend ideas", discussedAt: atStart.toISOString() },
    };
    const before = await db.notification.count({ where: { relationshipId } });
    for (const member of [a, b]) {
      const response = await read(relationshipId, member);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(expected);
      expect(response.headers["cache-control"]).toBe("private, no-store");
    }
    expect(await db.notification.count({ where: { relationshipId } })).toBe(before);
    expect((await read(relationshipId, outside.a)).statusCode).toBe(404);
    expect((await read(relationshipId)).statusCode).toBe(401);
    expect((await read(relationshipId, a, b.id)).statusCode).toBe(409);

    // The original items are read live; Undo done or deletion is reflected
    // without keeping a copy of their old contents in a recap.
    await db.roadmapPlan.update({ where: { id: stored.id }, data: { status: "ACCEPTED", completedAt: null } });
    await db.togetherPhoto.delete({ where: { id: photo.id } });
    expect((await read(relationshipId, b)).json()).toEqual({ ...expected, plans: [], memories: [] });
  });

  it("requires mutual Lock In and revokes both partners’ recap when blocked or ended", async () => {
    const { a, b, relationshipId } = await pair(false);
    expect((await read(relationshipId, a)).statusCode).toBe(404);
    await db.relationship.update({ where: { id: relationshipId }, data: { directLockedInAt: beforeWeek } });
    expect((await read(relationshipId, a)).json()).toEqual({
      startsOn: "2026-11-16", endsOn: "2026-11-22", plans: [], memories: [], topic: null,
    });
    const block = await db.invitationBlock.create({ data: { blockerId: b.id, blockedId: a.id } });
    for (const member of [a, b]) expect((await read(relationshipId, member)).statusCode).toBe(404);
    await db.invitationBlock.delete({ where: { id: block.id } });
    const { leaveMessagingRelationship } = await import("../messaging/messaging-lifecycle.service.js");
    expect(await leaveMessagingRelationship(relationshipId, a.id)).toBe(true);
    for (const member of [a, b]) {
      const response = await read(relationshipId, member);
      expect(response.statusCode).toBe(404);
      expect(response.headers["cache-control"]).toBe("private, no-store");
    }
  });

  it("records discussion on that action, not when a topic is filed, and clears it on reopen", async () => {
    const { a, b, relationshipId } = await pair();
    const { addRoomTopic, fileRoomTopic, transitionRoomTopic } = await import("../room-to-talk/room-to-talk.service.js");
    const id = randomUUID();
    const timestamp = async () => (await db.roomTalkTopic.findUniqueOrThrow({ where: { id }, select: { discussedAt: true } })).discussedAt;
    await addRoomTopic(relationshipId, a.id, { id, question: "Next Saturday", shelf: "unsorted" });
    expect(await timestamp()).toBeNull();
    await transitionRoomTopic(relationshipId, b.id, id, { action: "discuss", takeaway: null });
    const discussed = await timestamp();
    expect(discussed).toBeInstanceOf(Date);
    await fileRoomTopic(relationshipId, a.id, id, "date-ideas");
    expect(await timestamp()).toEqual(discussed);
    await transitionRoomTopic(relationshipId, a.id, id, { action: "reopen" });
    expect(await timestamp()).toBeNull();
  });
});
