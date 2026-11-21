import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RelationshipMessages from "./components/RelationshipMessages";
describe("shared-space Messages entry", () => {
  it("links to existing chat without requiring Discovery enrollment", () => {
    const html = renderToStaticMarkup(<RelationshipMessages messaging={{ enabled: true, conversationId: "direct-chat" }}/>);
    expect(html).toContain('href="/messages/direct-chat?from=together"'); expect(html).toContain("Messages"); expect(html).not.toContain("Discover");
  });
  it.each([undefined,{ enabled: false, conversationId: "chat" },{ enabled: true, conversationId: null }])("hides unavailable or rollout-disabled entry", messaging => {
    expect(renderToStaticMarkup(<RelationshipMessages messaging={messaging}/>)).toBe("");
  });
});
