import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AtlasDefinitionConvergence from "./AtlasDefinitionConvergence";
import type { AtlasChapter, AtlasWord } from "./atlas.types";

const chapter: AtlasChapter = {
  id: "legacy-chapter", status: "PROPOSED", createdAt: "2026-11-14T12:00:00Z",
  sharedDefinition: "A meaning saved before independent proposals existed.", candidateVersion: 1,
  ownFinalApproval: false, partnerFinalApproval: false,
  proposedByCurrentUser: true, proposedByName: "Evans",
  proposals: [], ownSelection: null, partnerSelection: null,
  ownResponse: null, partnerResponse: { submitted: true, name: "Kwame" },
};
const word: AtlasWord = {
  key: "support", title: "Support", icon: "✦", color: "coral",
  description: "Care in action", mysteryPrompt: "A moment of care", versionCount: 0, chapter,
};

describe("Atlas legacy chapter rendering", () => {
  it("keeps a lone personal proposal waiting for its counterpart on a legacy chapter", () => {
    const legacyChapter = { ...chapter, proposals: [{ id: "proposal-1", definition: "Steady care in action", proposedByCurrentUser: true, proposedByName: "Evans" }] };
    const html = renderToStaticMarkup(createElement(AtlasDefinitionConvergence, {
      word, chapter: legacyChapter, partnerName: "Kwame", busy: false, runAction: async () => {},
    }));
    expect(html).toContain("Your proposal is waiting beside an empty space.");
  });

  it("keeps the independent proposal form available when a legacy final draft has no personal proposals", () => {
    const html = renderToStaticMarkup(createElement(AtlasDefinitionConvergence, {
      word, chapter, partnerName: "Kwame", busy: false, runAction: async () => {},
    }));
    expect(html).toContain("Preserve my proposal");
  });
});
