import { describe, expect, it } from "vitest";
import { suggestionMatches } from "./conversation-suggestion.identity.js";

describe("original conversation suggestion identity", () => {
  const notification = {
    recipientId: "b",
    kind: "CONVERSATION_CHOICE",
    entityId: "pair",
    eventKey: '["b","CONVERSATION_CHOICE","pair","choice:direction"]',
    resolvedAt: null,
    suppressed: false,
  };
  const choice = { id: "choice", userId: "a", packKey: "direction" };
  it("accepts only the represented partner choice", () => {
    expect(suggestionMatches(notification, "b", "pair", choice)).toBe(true);
    expect(suggestionMatches(notification, "a", "pair", choice)).toBe(false);
    expect(suggestionMatches(notification, "b", "other", choice)).toBe(false);
    expect(
      suggestionMatches(notification, "b", "pair", { ...choice, userId: "b" }),
    ).toBe(false);
  });
  it("rejects replacement topics and recreated choices", () => {
    expect(
      suggestionMatches(notification, "b", "pair", {
        ...choice,
        packKey: "connection",
      }),
    ).toBe(false);
    expect(
      suggestionMatches(notification, "b", "pair", {
        ...choice,
        id: "new-choice",
      }),
    ).toBe(false);
    expect(suggestionMatches(notification, "b", "pair", null)).toBe(false);
  });
  it("rejects resolved, suppressed, malformed, and unrelated notifications", () => {
    for (const update of [
      { resolvedAt: new Date() },
      { suppressed: true },
      { eventKey: "invalid" },
      { kind: "CONVERSATION_READY" },
    ]) {
      expect(
        suggestionMatches({ ...notification, ...update }, "b", "pair", choice),
      ).toBe(false);
    }
  });
  it("recognizes recurring occurrences without conflating Either with no choice", () => {
    expect(
      suggestionMatches(
        { ...notification, eventKey: notification.eventKey + "::42" },
        "b",
        "pair",
        choice,
      ),
    ).toBe(true);
    expect(
      suggestionMatches(
        {
          ...notification,
          eventKey: '["b","CONVERSATION_CHOICE","pair","choice:either"]',
        },
        "b",
        "pair",
        { ...choice, packKey: null },
      ),
    ).toBe(true);
    expect(
      suggestionMatches(notification, "b", "pair", {
        ...choice,
        packKey: null,
      }),
    ).toBe(false);
  });
});
