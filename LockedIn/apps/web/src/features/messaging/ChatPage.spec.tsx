import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatPageBody, ConversationContent } from "./ChatPage";
import type { ConversationMetadata } from "./messaging.types";
const base: ConversationMetadata = { id: "conversation", partner: { publicName: "Sam", avatarPreset: "leaf" }, canChat: true, unavailableReason: null };
describe("neutral Messages page", () => {
  it("keeps the chat mounted during a transient availability refresh failure", () => {
    const html = renderToStaticMarkup(<ChatPageBody userId="a" metadata={base} error="Could not refresh" retry={() => {}} onAccessEnded={() => {}}/>);
    expect(html).toContain("Could not refresh"); expect(html).toContain("Conversation with Sam");
  });
  it("opens direct chat without Discovery or exposing a public profile action", () => {
    const html = renderToStaticMarkup(<ConversationContent userId="a" metadata={base} onAccessEnded={() => {}}/>);
    expect(html).toContain("Conversation with Sam"); expect(html).toContain("Messages"); expect(html).not.toContain("View Sam"); expect(html).not.toContain("Save privately");
  });
  it("offers authorized profile viewing only when metadata permits it", () => {
    const html = renderToStaticMarkup(<ConversationContent userId="a" metadata={{...base,profileConnectionId:"discovery-source"}} onAccessEnded={() => {}}/>);
    expect(html).toContain("View Sam’s profile");
  });
  it("explains own verification, otherwise uses generic unavailability with no opener or composer", () => {
    const unverified = renderToStaticMarkup(<ConversationContent userId="a" metadata={{ ...base,canChat:false,unavailableReason:"VERIFY_EMAIL" }} onAccessEnded={() => {}}/>);
    expect(unverified).toContain("Verify your email"); expect(unverified).not.toContain("Scrollable conversation");
    const unavailable = renderToStaticMarkup(<ConversationContent userId="a" metadata={{ ...base,canChat:false,unavailableReason:"UNAVAILABLE" }} onAccessEnded={() => {}}/>);
    expect(unavailable).toContain("This chat is unavailable"); expect(unavailable).not.toContain("suspended");
  });
});
