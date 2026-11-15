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
  it("places partner review before topic browsing and defers details", () => {
    const html = renderToStaticMarkup(
      createElement(ConversationLibrary, props),
    );
    expect(html.indexOf("Evans")).toBeLessThan(html.indexOf("Explore topics"));
    expect(html).toContain("View topic");
    expect(html).not.toContain("A longer description.");
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
