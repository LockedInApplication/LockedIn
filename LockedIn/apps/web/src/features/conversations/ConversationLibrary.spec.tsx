import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import ConversationLibrary, {
  type ConversationLibraryProps,
} from "./ConversationLibrary";
const props: ConversationLibraryProps = {
  packs: [
    {
      key: "direction",
      title: "Direction",
      description: "A longer description.",
      icon: "↗",
      accent: "mint",
      questionCount: 3,
    },
    {
      key: "support",
      title: "Support",
      description: "What helps you feel heard.",
      icon: "◎",
      accent: "mint",
      questionCount: 3,
    },
  ],
  selection: {
    ownChoice: { submitted: false, packKey: null },
    partnerChoice: { submitted: true, packKey: "direction", name: "Evans" },
  },
  currentPackKey: null,
  canStart: true,
  busy: false,
  onStart: () => {},
  onWithdraw: () => {},
};
describe("compact conversation browser", () => {
  it("places the partner’s suggestion before flat, descriptive topic rows", () => {
    const html = renderToStaticMarkup(
      createElement(ConversationLibrary, props),
    );
    expect(html.indexOf("Evans")).toBeLessThan(html.indexOf("Explore topics"));
    expect(html).toContain("data-review-suggestion");
    expect(html).toContain('data-topic="support"');
    expect(html).not.toContain('data-topic="direction"');
    expect(html).toContain("A longer description.");
    expect(html).toContain("How choosing together works");
    expect(html).toContain("Either works for me");
  });
  it("retains withdrawal and disables choices during an active check-in", () => {
    const html = renderToStaticMarkup(
      createElement(ConversationLibrary, {
        ...props,
        canStart: false,
        selection: {
          ...props.selection!,
          ownChoice: { submitted: true, packKey: null },
        },
      }),
    );
    expect(html).toContain("Withdraw");
    expect(html).toContain("Either conversation");
    expect(html).toContain("Finish your current");
  });
});
