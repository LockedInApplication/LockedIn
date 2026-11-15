import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ viewer: "own" as string | null, status: "SHARED", exists: true }));
const repository = vi.hoisted(() => ({ meaningChapter: { findFirst: vi.fn() } }));
vi.mock("../../lib/prisma.js", () => ({ prisma: repository }));
vi.mock("../../lib/session.js", () => ({
  getAuthenticatedUser: async () => state.viewer ? { id: state.viewer, name: "Viewer", email: "viewer@example.com" } : null,
}));

import { registerAtlasRoutes } from "./atlas.routes.js";

const ownResponse = {
  id: "own-response", userId: "own", definition: "Care through steady actions",
  example: "Checking in after a difficult day", notMeaning: "Taking over every decision",
  heardSummary: "You need intentional presence", heardStatus: "CONFIRMED",
};
const partnerResponse = {
  id: "partner-response", userId: "partner", definition: "Intentional presence",
  example: "Listening without rushing to fix things", notMeaning: "Agreeing with everything",
  heardSummary: "You need care through steady actions", heardStatus: "CONFIRMED",
};
const record = {
  id: "completed-chapter", relationshipId: "relationship-1", wordKey: "support", createdById: "own",
  status: "SHARED", candidateVersion: 0, sharedDefinitionProposedById: "own",
  sharedDefinition: "Showing up with care and intention",
  createdAt: new Date("2026-11-01T12:00:00Z"), updatedAt: new Date("2026-11-14T12:00:00Z"),
  responses: [ownResponse, partnerResponse],
  relationship: {
    id: "relationship-1", status: "ACTIVE", createdAt: new Date("2026-11-01T12:00:00Z"), updatedAt: new Date("2026-11-14T12:00:00Z"),
    members: [
      { id: "member-own", relationshipId: "relationship-1", userId: "own", user: { id: "own", name: "Evans", displayName: null, email: "own@example.com" } },
      { id: "member-partner", relationshipId: "relationship-1", userId: "partner", user: { id: "partner", name: "Kwame", displayName: "Partner", email: "partner@example.com" } },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  state.viewer = "own";
  state.status = "SHARED";
  state.exists = true;
  repository.meaningChapter.findFirst.mockImplementation(async (query) => {
    const viewer = query.where.relationship?.members?.some?.userId;
    if (!state.exists || query.where.id !== record.id || query.where.status !== "SHARED" || state.status !== "SHARED" || !record.relationship.members.some((member) => member.userId === viewer)) return null;
    return record;
  });
});

async function requestChapter(id = record.id) {
  const server = Fastify();
  await registerAtlasRoutes(server);
  try {
    return await server.inject({ method: "GET", url: `/api/journey/atlas/${id}` });
  } finally {
    await server.close();
  }
}

describe("GET completed Atlas chapter", () => {
  it("reopens a legacy shared chapter with both original responses and the saved agreement", async () => {
    const response = await requestChapter();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: record.id, word: { key: "support", title: "Support" },
      createdAt: "2026-11-01T12:00:00.000Z", sharedAt: "2026-11-14T12:00:00.000Z",
      sharedDefinition: "Showing up with care and intention",
      ownResponse: { definition: "Care through steady actions", heardSummary: "You need intentional presence", heardStatus: "CONFIRMED" },
      partner: { name: "Partner", response: { definition: "Intentional presence", heardSummary: "You need care through steady actions", heardStatus: "CONFIRMED" } },
    });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(JSON.stringify(response.json())).not.toContain("@example.com");
    expect(response.json().ownResponse).not.toHaveProperty("userId");
  });

  it("swaps own/partner responses correctly for the other member", async () => {
    state.viewer = "partner";
    const response = await requestChapter();
    expect(response.statusCode).toBe(200);
    expect(response.json().ownResponse.definition).toBe("Intentional presence");
    expect(response.json().partner.name).toBe("Evans");
    expect(response.json().partner.response.definition).toBe("Care through steady actions");
  });

  it("requires login before reading any chapter", async () => {
    state.viewer = null;
    const response = await requestChapter();
    expect(response.statusCode).toBe(401);
    expect(repository.meaningChapter.findFirst).not.toHaveBeenCalled();
  });

  it("returns no chapter details to a person outside the relationship", async () => {
    state.viewer = "outsider";
    const response = await requestChapter();
    expect(response.statusCode).toBe(404);
    expect(JSON.stringify(response.json())).not.toContain("steady actions");
  });

  it("does not expose an unfinished chapter", async () => {
    state.status = "COLLECTING";
    const response = await requestChapter();
    expect(response.statusCode).toBe(404);
    expect(JSON.stringify(response.json())).not.toContain("Intentional presence");
  });

  it("handles missing chapter IDs without leaking other records", async () => {
    expect((await requestChapter("missing-chapter")).statusCode).toBe(404);
  });
});
