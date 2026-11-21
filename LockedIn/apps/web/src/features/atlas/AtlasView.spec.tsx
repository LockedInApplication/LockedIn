import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AtlasView from "./AtlasView";
import type { AtlasChapter, AtlasWord } from "./atlas.types";

const savedDefinition = "Showing up with care, consistency, and intention";
const chapter: AtlasChapter = {
  id: "current-chapter", status: "COLLECTING", createdAt: "2026-11-14T20:00:00Z",
  sharedDefinition: null, candidateVersion: 0, ownFinalApproval: false, partnerFinalApproval: false,
  proposedByCurrentUser: false, proposedByName: null, proposals: [],
  ownSelection: null, partnerSelection: null, ownResponse: null,
  partnerResponse: { submitted: false, name: "Partner" },
};
const word: AtlasWord = {
  key: "support", title: "Support", icon: "✦", color: "coral",
  description: "Care in action", mysteryPrompt: "Describe a moment of care", versionCount: 1,
  previousDefinitions: [{ id: "completed-chapter", definition: savedDefinition, sharedAt: "2026-11-14T19:30:00Z" }],
  chapter,
};

function render(value: AtlasWord) {
  return renderToStaticMarkup(createElement(AtlasView, {
    words: [value], relationshipId: "relationship-1", partnerName: "Partner", busy: false,
    runAction: async () => {},
  }));
}

describe("completed Atlas chapters", () => {
  it("introduces Atlas with the same name as the homepage preview", () => {
    expect(render(word)).toContain('<h1 id="atlas-title">The Atlas of Us</h1>');
  });

  it.each(["own", "partner"] as const)("keeps the viewer reachable when a current legacy shared chapter is missing the %s response", (missing) => {
    const html = render({
      ...word, previousDefinitions: [],
      chapter: {
        ...chapter, status: "SHARED", sharedDefinition: savedDefinition,
        ownResponse: missing === "own" ? null : { id: "own-response", definition: "Steady care", example: "Being present", notMeaning: "Taking over", heardSummary: null, heardStatus: null },
        partnerResponse: { submitted: missing !== "partner", name: "Partner" },
      },
    });
    expect(html).toContain("View full chapter");
    expect(html).toContain(savedDefinition);
    expect(html).not.toContain("Lock in my meaning");
  });

  it("offers View full chapter on every completed history entry", () => {
    const html = render(word);
    expect(html).toContain("View full chapter");
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it("also offers View full chapter for the current shared chapter", () => {
    const html = render({
      ...word, previousDefinitions: [],
      chapter: {
        ...chapter, status: "SHARED", sharedDefinition: savedDefinition,
        ownResponse: { id: "own-response", definition: "Steady care", example: "Being present", notMeaning: "Taking over", heardSummary: "Intentional presence", heardStatus: "CONFIRMED" },
        partnerResponse: { submitted: true, name: "Partner", id: "partner-response", definition: "Intentional presence", example: "Listening", notMeaning: "Agreeing with everything", heardSummary: "Steady care", heardStatus: "CONFIRMED" },
      },
    });
    expect(html).toContain("View full chapter");
  });

  it("keeps a completed meaning visible before either person answers the new chapter", () => {
    const html = render(word);
    expect(html).toContain(savedDefinition);
    expect(html).toContain("Completed Support chapters");
    expect(html).toContain("Lock in my meaning");
    expect(html.indexOf(savedDefinition)).toBeLessThan(html.indexOf("Lock in my meaning"));
  });

  it("distinguishes a completed landmark from the new chapter still in progress", () => {
    expect(render(word)).toContain("Shared · new chapter in progress");
  });

  it("keeps the completed meaning visible while waiting for the partner", () => {
    const html = render({
      ...word,
      chapter: {
        ...chapter,
        ownResponse: { id: "own-response", definition: "New private meaning", example: "A recent moment", notMeaning: "Taking over decisions", heardSummary: null, heardStatus: null },
      },
    });
    expect(html).toContain(savedDefinition);
    expect(html).toContain("YOUR MEANING IS SAFE");
    expect(html).not.toContain("New private meaning");
  });

  it("shows the completed history once after both new responses are ready", () => {
    const html = render({
      ...word,
      chapter: {
        ...chapter, status: "DISCOVERING",
        ownResponse: { id: "own-response", definition: "My new meaning", example: "A recent moment", notMeaning: "Taking over decisions", heardSummary: null, heardStatus: null },
        partnerResponse: { submitted: true, name: "Partner", id: "partner-response", definition: "Their new meaning", example: "Another moment", notMeaning: "Solving everything", heardSummary: null, heardStatus: null },
      },
    });
    expect(html).toContain("Completed Support chapters");
    expect(html.split(savedDefinition)).toHaveLength(2);
    expect(html).toContain("My new meaning");
    expect(html).toContain("Their new meaning");
  });

  it("keeps all earlier completed definitions accessible", () => {
    const html = render({
      ...word, versionCount: 2,
      previousDefinitions: [
        { id: "second", definition: "Showing up with care", sharedAt: "2026-11-14T19:30:00Z" },
        { id: "first", definition: savedDefinition, sharedAt: "2026-11-01T12:00:00Z" },
      ],
    });
    expect(html).toContain("Showing up with care");
    expect(html).toContain(savedDefinition);
  });

  it("does not invent a completed chapter for an unexplored landmark", () => {
    const html = render({ ...word, versionCount: 0, previousDefinitions: [], chapter: null });
    expect(html).not.toContain("Completed Support chapters");
    expect(html).toContain("Unexplored");
  });
});
