import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { SuggestionContent } from "./ConversationSuggestionView";
describe("focused suggestion content", () => {
  it("makes acceptance explicit and keeps privacy visible", () => {
    const html = renderToStaticMarkup(
      createElement(SuggestionContent, {
        data: {
          status: "pending",
          relationshipId: "pair",
          partnerName: "Evans",
          pack: {
            key: "direction",
            title: "Direction",
            description: "Talk together",
            questionCount: 3,
            icon: "↗",
            accent: "mint",
          },
          canStart: true,
        },
        busy: false,
        onAccept: () => {},
        onBrowse: () => {},
      }),
    );
    expect(html).toContain("Accept this conversation");
    expect(html).toContain("Evans");
    expect(html).toContain("Sharing");
    expect(html).not.toContain("roadmap");
  });
  it("never offers acceptance for resolved suggestions", () => {
    const html = renderToStaticMarkup(
      createElement(SuggestionContent, {
        data: { status: "unavailable", reason: "resolved" },
        busy: false,
        onAccept: () => {},
        onBrowse: () => {},
      }),
    );
    expect(html).not.toContain("Accept this conversation");
    expect(html).toContain("moved on");
  });
  it("does not offer acceptance for Either or an unfinished active session", () => {
    for (const data of [
      {
        status: "pending" as const,
        relationshipId: "pair",
        partnerName: "Evans",
        pack: null,
        canStart: true,
      },
      {
        status: "pending" as const,
        relationshipId: "pair",
        partnerName: "Evans",
        pack: null,
        canStart: false,
      },
    ]) {
      expect(
        renderToStaticMarkup(
          createElement(SuggestionContent, {
            data,
            busy: false,
            onAccept: () => {},
            onBrowse: () => {},
          }),
        ),
      ).not.toContain("Accept this conversation");
    }
  });
});
