import { describe, expect, it, vi } from "vitest";
vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
import { chooseConversation } from "./conversation.service.js";
describe("conditional suggestion acceptance", () => {
  it("refuses a stale notification before changing either choice", async () => {
    let writes = 0;
    const tx = {
      $queryRaw: async () => [],
      notification: { findFirst: async () => null },
      intentionSession: { findFirst: async () => null },
      conversationChoice: {
        upsert: async () => {
          writes++;
        },
        findMany: async () => [],
      },
    };
    const result = await chooseConversation(
      "pair",
      "b",
      "direction",
      tx as never,
      1n,
    );
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(writes).toBe(0);
  });
});
