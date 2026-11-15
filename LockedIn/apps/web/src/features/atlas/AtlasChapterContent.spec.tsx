import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AtlasChapterContent from "./AtlasChapterContent";
import type { AtlasCompletedChapter } from "./atlas.types";

const chapter: AtlasCompletedChapter = {
  id: "completed-chapter", word: { key: "support", title: "Support", icon: "✦", color: "coral" },
  createdAt: "2026-11-01T12:00:00Z", sharedAt: "2026-11-14T12:00:00Z",
  sharedDefinition: "Showing up with care and intention",
  ownResponse: { id: "own-response", definition: "Steady care in action", example: "Checking in after a difficult day", notMeaning: "Taking over decisions", heardSummary: "You need intentional presence", heardStatus: "CONFIRMED" },
  partner: {
    name: "Partner",
    response: { id: "partner-response", definition: "Intentional presence", example: "Listening without trying to fix everything", notMeaning: "Agreeing with everything", heardSummary: "You need steady care in action", heardStatus: "CONFIRMED" },
  },
};

describe("completed chapter content", () => {
  it("shows both saved meanings, examples, boundaries, understanding checks and the final agreement", () => {
    const html = renderToStaticMarkup(createElement(AtlasChapterContent, { chapter }));
    for (const text of [
      "Steady care in action", "Checking in after a difficult day", "Taking over decisions",
      "Intentional presence", "Listening without trying to fix everything", "Agreeing with everything",
      "You need intentional presence", "You need steady care in action", "Showing up with care and intention",
    ]) expect(html).toContain(text);
    expect(html).toContain("What you heard from Partner");
    expect(html).toContain("What Partner heard from you");
    expect(html).toContain("Partner confirmed this");
    expect(html).toContain("You confirmed this");
  });

  it("offers no editing, submission or approval controls", () => {
    const html = renderToStaticMarkup(createElement(AtlasChapterContent, { chapter }));
    expect(html).not.toMatch(/<(form|input|textarea|button)\b/);
    expect(html).toContain("Read-only");
  });

  it("handles missing legacy fields without inventing answers or completed checks", () => {
    const html = renderToStaticMarkup(createElement(AtlasChapterContent, {
      chapter: { ...chapter, sharedDefinition: null, ownResponse: null, partner: { name: "Partner", response: null } },
    }));
    expect(html).toContain("No response was saved for this person.");
    expect(html).toContain("No understanding summary was saved.");
    expect(html).toContain("No shared wording was saved.");
    expect(html).not.toContain("confirmed this");
  });
});
