import { describe, expect, it, vi } from "vitest";
vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
import { resolveConversationSuggestion } from "./conversation-suggestion.service.js";
const note = {
  recipientId: "b",
  kind: "CONVERSATION_CHOICE",
  entityId: "pair",
  relationshipId: "pair",
  eventKey: '["b","CONVERSATION_CHOICE","pair","choice:direction"]',
  resolvedAt: null,
  suppressed: false,
};
function database(
  update = {},
  choice: object | null = { id: "choice", userId: "a", packKey: "direction" },
  status = "ACTIVE",
  complete = true,
) {
  return {
    notification: { findFirst: vi.fn(async () => ({ ...note, ...update })) },
    relationship: {
      findUnique: vi.fn(async () => ({
        id: "pair",
        status,
        members: [
          { userId: "a", user: { name: "Partner", displayName: null } },
          { userId: "b", user: { name: "B", displayName: null } },
        ],
      })),
    },
    conversationChoice: { findFirst: vi.fn(async () => choice) },
    intentionSession: {
      findFirst: vi.fn(async () => (complete ? null : { responses: [] })),
    },
  };
}
describe("resolve conversation suggestion", () => {
  it("returns a pending catalog preview without submitting a choice", async () => {
    const result = await resolveConversationSuggestion(
      database() as never,
      "b",
      1n,
    );
    expect(result).toMatchObject({
      status: "pending",
      relationshipId: "pair",
      partnerName: "Partner",
      canStart: true,
      pack: { key: "direction", questionCount: 4 },
    });
    expect(result && "pack" in result && result.pack).not.toHaveProperty(
      "questions",
    );
  });
  it("does not disclose foreign or suppressed notifications", async () => {
    expect(
      await resolveConversationSuggestion(
        database({ recipientId: "a" }) as never,
        "b",
        1n,
      ),
    ).toBeNull();
    expect(
      await resolveConversationSuggestion(
        database({ suppressed: true }) as never,
        "b",
        1n,
      ),
    ).toBeNull();
  });
  it("reports ended, resolved and changed states", async () => {
    expect(
      await resolveConversationSuggestion(
        database({}, null, "ENDED") as never,
        "b",
        1n,
      ),
    ).toEqual({ status: "unavailable", reason: "ended" });
    expect(
      await resolveConversationSuggestion(
        database({ resolvedAt: new Date() }) as never,
        "b",
        1n,
      ),
    ).toEqual({ status: "unavailable", reason: "resolved" });
    expect(
      await resolveConversationSuggestion(database({}, null) as never, "b", 1n),
    ).toEqual({ status: "unavailable", reason: "changed" });
    expect(
      await resolveConversationSuggestion(
        database(
          {},
          { id: "choice", userId: "a", packKey: "connection" },
        ) as never,
        "b",
        1n,
      ),
    ).toEqual({ status: "unavailable", reason: "changed" });
  });
  it("marks an unfinished session ineligible and supports Either", async () => {
    expect(
      await resolveConversationSuggestion(
        database({}, undefined, "ACTIVE", false) as never,
        "b",
        1n,
      ),
    ).toMatchObject({ status: "pending", canStart: false });
    expect(
      await resolveConversationSuggestion(
        database(
          { eventKey: '["b","CONVERSATION_CHOICE","pair","choice:either"]' },
          { id: "choice", userId: "a", packKey: null },
        ) as never,
        "b",
        1n,
      ),
    ).toMatchObject({ status: "pending", pack: null });
  });
});
