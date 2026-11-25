import { describe, expect, it } from "vitest";
import { currentCheckInHref, conversationTopicHref, getWorkspaceView, ourWeekDetailHref, ourWeekHref, ourWeekSource, roomToTalkHref, workspaceBack, workspaceViewUrl } from "./journey.navigation";

describe("workspace section URLs", () => {
  it.each(["home", "talk", "check-ins", "conversations", "atlas", "roadmap", "chapters", "memories", "room-to-talk", "our-week", "options"] as const)(
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

  it("keeps old check-in links intact without putting the check-in back on Home", () => {
    expect(getWorkspaceView("", "#current-action")).toBe("check-ins");
    expect(currentCheckInHref).toBe("/journey?view=check-ins#current-action");
    expect(workspaceViewUrl("/journey#current-action", "home")).toBe("/journey");
  });

  it("gives each subview a contextual parent instead of another row of tabs", () => {
    expect(workspaceBack("room-to-talk")).toEqual({ view: "talk", label: "Talk" });
    expect(workspaceBack("check-ins")).toEqual({ view: "talk", label: "Talk" });
    expect(workspaceBack("chapters")).toEqual({ view: "check-ins", label: "Check-ins" });
    expect(workspaceBack("roadmap")).toEqual({ view: "home", label: "Together" });
  });

  it("restores the recap parent from original details without making it the default parent", () => {
    const plan = ourWeekDetailHref("/journey?view=roadmap#step-id");
    const photo = ourWeekDetailHref("/journey?view=memories#memory-photo/id");
    expect(plan).toBe("/journey?view=roadmap&from=our-week#step-id");
    expect(photo).toBe("/journey?view=memories&from=our-week#memory-photo/id");
    for (const view of ["roadmap", "memories"] as const) {
      expect(workspaceBack(view, ourWeekSource)).toEqual({ view: "our-week", label: "Our Week Together" });
      expect(workspaceBack(view)).toEqual({ view: "home", label: "Together" });
    }
    expect(workspaceViewUrl(plan, "our-week")).toBe(ourWeekHref);
    expect(workspaceViewUrl(photo, "home")).toBe("/journey");
    expect(workspaceBack("our-week")).toEqual({ view: "home", label: "Together" });
  });
});
