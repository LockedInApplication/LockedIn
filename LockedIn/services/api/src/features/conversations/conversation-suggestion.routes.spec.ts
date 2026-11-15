import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  user: { id: "b", name: "B" } as { id: string; name: string } | null,
  resolve: vi.fn(),
  choose: vi.fn(),
}));
vi.mock("../../lib/session.js", () => ({
  getAuthenticatedUser: async () => fake.user,
}));
vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("./conversation-suggestion.service.js", () => ({
  resolveConversationSuggestion: (...args: unknown[]) => fake.resolve(...args),
}));
vi.mock("./conversation-choice.action.js", () => ({
  performConversationChoice: (...args: unknown[]) => fake.choose(...args),
}));
import { registerConversationSuggestionRoutes } from "./conversation-suggestion.routes.js";
beforeEach(() => {
  vi.clearAllMocks();
  fake.user = { id: "b", name: "B" };
  fake.resolve.mockResolvedValue({
    status: "pending",
    relationshipId: "pair",
    pack: { key: "direction" },
    canStart: true,
  });
  fake.choose.mockResolvedValue({ started: true, sessionId: "session" });
});
describe("suggestion HTTP boundaries", () => {
  async function app() {
    const s = Fastify();
    await registerConversationSuggestionRoutes(s);
    return s;
  }
  it("requires login and validates notification IDs", async () => {
    const s = await app();
    fake.user = null;
    expect(
      (await s.inject("/api/journey/notifications/1/conversation-suggestion"))
        .statusCode,
    ).toBe(401);
    fake.user = { id: "b", name: "B" };
    expect(
      (
        await s.inject(
          "/api/journey/notifications/oops/conversation-suggestion",
        )
      ).statusCode,
    ).toBe(400);
    await s.close();
  });
  it("returns private previews and hides foreign notifications", async () => {
    const s = await app();
    const r = await s.inject(
      "/api/journey/notifications/1/conversation-suggestion",
    );
    expect(r.headers["cache-control"]).toContain("no-store");
    expect(r.json()).toMatchObject({ status: "pending" });
    fake.resolve.mockResolvedValue(null);
    expect(
      (await s.inject("/api/journey/notifications/1/conversation-suggestion"))
        .statusCode,
    ).toBe(404);
    await s.close();
  });
  it("accepts only pending eligible suggestions, surfacing races as conflicts", async () => {
    const s = await app();
    const url = "/api/journey/notifications/1/conversation-suggestion";
    expect((await s.inject({ method: "POST", url })).statusCode).toBe(201);
    fake.choose.mockResolvedValue({ error: "Changed" });
    expect((await s.inject({ method: "POST", url })).statusCode).toBe(409);
    fake.resolve.mockResolvedValue({
      status: "unavailable",
      reason: "resolved",
    });
    expect((await s.inject({ method: "POST", url })).statusCode).toBe(409);
    await s.close();
  });
});
