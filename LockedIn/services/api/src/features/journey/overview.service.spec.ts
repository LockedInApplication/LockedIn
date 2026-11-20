import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  user: { findUniqueOrThrow: vi.fn() },
  relationship: { findFirst: vi.fn() },
  relationshipInvite: { findMany: vi.fn() },
  intentionSession: { findMany: vi.fn() },
  conversationChoice: { findMany: vi.fn() },
  meaningChapter: { findMany: vi.fn() },
  invitationBlock: { findFirst: vi.fn() },
  discoveryProfile: { findUnique: vi.fn() },
  discoveryModerationAudit: { findFirst: vi.fn() },
  roadmapPlan: { findMany: vi.fn() },
}));
vi.mock("../../lib/prisma.js", () => ({ prisma: repository }));

import { buildJourneyOverview } from "./overview.service.js";

const user = { id: "own", email: "evans@example.com", name: "Evans" };
const createdAt = new Date("2026-11-14T12:00:00Z");
const connectedSpace = {
  id: "relationship-1", status: "ACTIVE", createdAt, updatedAt: createdAt,
  members: [
    { id: "member-own", relationshipId: "relationship-1", userId: user.id, user: { ...user, displayName: null } },
    { id: "member-partner", relationshipId: "relationship-1", userId: "partner", user: { id: "partner", name: "Kwame", displayName: null, email: "kwame@example.com" } },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  repository.user.findUniqueOrThrow.mockResolvedValue(user);
  repository.relationship.findFirst.mockResolvedValue(null);
  repository.relationshipInvite.findMany.mockResolvedValue([]);
  repository.intentionSession.findMany.mockResolvedValue([]);
  repository.conversationChoice.findMany.mockResolvedValue([]);
  repository.meaningChapter.findMany.mockResolvedValue([]);
  repository.invitationBlock.findFirst.mockResolvedValue(null);
  repository.roadmapPlan.findMany.mockResolvedValue([]);
});

describe("buildJourneyOverview", () => {
  it("uses persisted preferred name and avatar rather than stale authenticated identity",async()=>{
    repository.user.findUniqueOrThrow.mockResolvedValue({...user,displayName:"Preferred",avatarPreset:"sun"});
    const overview=await buildJourneyOverview(user.id,user);
    expect(overview.user).toMatchObject({name:"Preferred",avatarPreset:"sun"});
  });
  it("preserves the complete empty state before a relationship exists", async () => {
    const overview = await buildJourneyOverview(user.id);
    expect(overview.user).toEqual(user);
    expect(overview.relationship).toBeNull();
    expect(overview.session).toBeNull();
    expect(overview.simplePlans).toEqual([]);
    expect(overview.conversationSelection).toBeNull();
    expect(overview.checkInHistory).toEqual([]);
    expect(overview.pendingInvites).toEqual([]);
    expect(overview.atlas.words.map(({ key, versionCount, chapter }) => ({ key, versionCount, chapter }))).toEqual([
      { key: "support", versionCount: 0, chapter: null },
      { key: "space", versionCount: 0, chapter: null },
      { key: "quality-time", versionCount: 0, chapter: null },
    ]);
  });

  it("retains invitation tokens, expiry dates, and inviter display names", async () => {
    const expiresAt = new Date("2026-11-21T12:00:00Z");
    repository.relationshipInvite.findMany.mockResolvedValue([{
      id: "invite-1", inviterId: "partner", inviteeId: user.id, inviteeEmail: user.email,
      token: "private-invite", status: "PENDING", expiresAt, acceptedAt: null,
      createdAt, updatedAt: createdAt,
      inviter: { id: "partner", displayName: "Kwame", name: "Kwame Addo", email: "kwame@example.com" },
    }]);
    const overview = await buildJourneyOverview(user.id);
    expect(overview.pendingInvites).toEqual([{
      id: "invite-1", token: "private-invite", expiresAt,
      inviter: { name: "Kwame", email: "kwame@example.com" },
    }]);
  });

  it("preserves a connected space before the first session", async () => {
    repository.relationship.findFirst.mockResolvedValue({ ...connectedSpace, discoveryConnection: null });
    const overview = await buildJourneyOverview(user.id);
    expect(overview.relationship).toEqual({ id: "relationship-1", isMutuallyLockedIn: false, partner: { name: "Kwame", email: "kwame@example.com" } });
    expect(overview.session).toBeNull();
    expect(overview.checkInHistory).toEqual([]);
    expect(overview.conversationSelection).toEqual({
      ownChoice: { submitted: false, packKey: null },
      partnerChoice: { submitted: false, packKey: null, name: "Kwame" },
    });
  });

  it.each([
    { state: "PROMOTED", lockedInAt: createdAt, expected: true },
    { state: "PROMOTED", lockedInAt: null, expected: false },
    { state: "CLOSED", lockedInAt: createdAt, expected: false },
  ])("reports $expected for $state with lock-in timestamp $lockedInAt", async ({ state, lockedInAt, expected }) => {
    repository.relationship.findFirst.mockResolvedValue({ ...connectedSpace, discoveryConnection: { state, lockedInAt } });
    const { relationship } = await buildJourneyOverview(user.id);
    expect(relationship?.isMutuallyLockedIn).toBe(expected);
    expect(relationship).not.toHaveProperty("discoveryConnection");
    expect(relationship).not.toHaveProperty("lockedInAt");
  });
});
