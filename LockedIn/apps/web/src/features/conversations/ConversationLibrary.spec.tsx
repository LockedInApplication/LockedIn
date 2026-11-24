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
    expect(html).toContain('<h2 id="your-topic" tabindex="-1">Pick a topic</h2>');
    expect(html).not.toContain("data-picked");
  });

  it("highlights the viewer’s pending pick instead of the partner’s suggestion or previous check-in", () => {
    const html = renderToStaticMarkup(createElement(ConversationLibrary, {
      ...props,
      currentPackKey: "direction",
      selection: { ...props.selection!, ownChoice: { submitted: true, packKey: "support" } },
    }));
    expect(html).toMatch(/id="your-topic"[^>]*data-picked="true"[^>]*data-topic="support"/);
    expect(html).toContain("Your pick");
    expect(html.match(/data-picked="true"/g)).toHaveLength(1);
  });

  it("highlights the matched topic when there is no pending choice", () => {
    const html = renderToStaticMarkup(createElement(ConversationLibrary, {
      ...props,
      currentPackKey: "direction",
      canStart: false,
    }));
    expect(html).toMatch(/id="your-topic"[^>]*data-picked="true"[^>]*data-topic="direction"/);
    expect(html).toContain("Current conversation");
    expect(html.match(/id="your-topic"/g)).toHaveLength(1);
  });

  it("retains withdrawal and disables choices during an active check-in", () => {
    const html = renderToStaticMarkup(
      createElement(ConversationLibrary, {
        ...props,
        canStart: false,
        currentPackKey: "direction",
        selection: {
          ...props.selection!,
          ownChoice: { submitted: true, packKey: null },
        },
      }),
    );
    expect(html).toContain("Withdraw");
    expect(html).toContain("Either conversation");
    expect(html).toContain("Finish your current");
    expect(html).toMatch(/<div[^>]*id="your-topic"[^>]*tabindex="-1"[^>]*>.*Either conversation/);
    expect(html.match(/data-picked="true"/g)).toHaveLength(1);
  });
});
