import { describe, expect, it } from "vitest";
import { conversationTopicHref, getWorkspaceView, roomToTalkHref, workspaceViewUrl } from "./journey.navigation";

describe("workspace section URLs", () => {
  it.each(["home", "conversations", "atlas", "roadmap", "chapters", "memories", "room-to-talk"] as const)(
    "restores the %s section from the URL", (view) => {
      expect(getWorkspaceView(`?view=${view}`)).toBe(view);
    },
  );

  it.each(["", "?view=unknown", "?view=constructor", "?invite=abc"])(
    "falls back to Home for %s", (search) => {
      expect(getWorkspaceView(search)).toBe("home");
    },
  );

  it("preserves invitation and other URL parameters when changing section", () => {
    expect(workspaceViewUrl("/journey?invite=abc&source=email#details", "atlas"))
      .toBe("/journey?invite=abc&source=email&view=atlas#details");
  });

  it("keeps the Home URL simple without losing other parameters", () => {
    expect(workspaceViewUrl("/journey?view=atlas&invite=abc", "home"))
      .toBe("/journey?invite=abc");
    expect(workspaceViewUrl("/journey?view=atlas", "home")).toBe("/journey");
  });

  it("drops the topic anchor on the way back from Conversations", () => {
    expect(workspaceViewUrl(conversationTopicHref, "home")).toBe("/journey");
    expect(workspaceViewUrl(conversationTopicHref, "roadmap")).toBe("/journey?view=roadmap");
  });

  it("leaves the room’s private topic and shelf out of unrelated Together URLs", () => {
    expect(workspaceViewUrl(roomToTalkHref({ topic: "a" }), "conversations")).toBe("/journey?view=conversations");
    expect(workspaceViewUrl(roomToTalkHref({ shelf: "marriage" }), "home")).toBe("/journey");
  });
});
