import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NextActionCard from "./NextActionCard";
import type { JourneyOverview } from "../journey.types";

const overview: JourneyOverview = {
  user: { id: "you", name: "You", email: "you@example.test" }, pendingInvites: [],
  relationship: { id: "pair", partner: { name: "Partner", email: "partner@example.test" } },
  session: null, checkInHistory: [], conversationPacks: [], conversationSelection: null, atlas: { words: [] },
};
function render(value: JourneyOverview, busy = false) {
  return renderToStaticMarkup(createElement(NextActionCard, {
    overview: value, busy, onNavigate: () => {}, onFocusCurrent: () => {},
  }));
}

describe("the Home next-action card", () => {
  it("provides one clear action without an answer or consent form", () => {
    const html = render(overview);
    expect(html).toContain("Pick a conversation topic");
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).toContain('type="button"');
    expect(html).not.toMatch(/<(form|input|textarea)\b/);
  });

  it("does not compete with the invitation flow before the pair connects", () => {
    expect(render({ ...overview, relationship: null })).toBe("");
  });

  it("prevents navigating away while a save is in progress", () => {
    expect(render(overview, true)).toContain('disabled=""');
  });
});
