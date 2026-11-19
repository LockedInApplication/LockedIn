import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Chat, { ChatTranscript } from "./Chat";
import MessageActions from "./MessageActions";

describe("reusable bounded conversation", () => {
  it("renders without Discovery context or a required opening prompt", () => {
    const html = renderToStaticMarkup(<Chat conversationId="direct" userId="a" partner={{ publicName: "Sam", avatarPreset: "leaf" }} onAccessEnded={() => {}}/>);
    expect(html).toContain("Messages"); expect(html).not.toContain("Save privately"); expect(html).not.toContain("opening reply below");
  });
  it("renders optional opening context and the same sent/received message list", () => {
    const props = { items: [{ id: "one", sequence: "1", author: "self" as const, text: "My message", createdAt: "2026-11-17T12:00:00Z" },{ id: "two", sequence: "2", author: "partner" as const, text: "Their message", createdAt: "2026-11-17T12:01:00Z" }], partnerName: "Sam", busy: false, onReport: () => {} };
    const html = renderToStaticMarkup(<ChatTranscript {...props} openingContext={<p>Opening reply</p>}/>);
    expect(html).toContain("Opening reply"); expect(html).toContain("My message"); expect(html).toContain("Their message"); expect(html).toContain("Sam");
    expect(html.match(/aria-label="Message actions"/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\bopen/);
    expect(renderToStaticMarkup(<ChatTranscript {...props}/>)).not.toContain("Opening reply");
  });
  it("keeps reporting inside a keyboard-accessible closed action menu", () => {
    const html = renderToStaticMarkup(<MessageActions busy={false} onReport={() => {}}/>);
    expect(html).toContain("<summary"); expect(html).toContain("Report message"); expect(html).not.toMatch(/<details[^>]*\bopen/);
  });
  it("keeps plain messages unlinked and opens details only for typed venue messages", () => {
    const base = { createdAt:"2026-11-19T12:00:00Z", author:"partner" as const, text:"Suggested date spot: Gallery" };
    const shared = { ...base,id:"venue",sequence:"1",dateSpot:true as const };
    const text = { ...base,id:"text",sequence:"2" };
    const html = renderToStaticMarkup(<ChatTranscript items={[shared,text]} partnerName="Sam" busy={false} onReport={() => {}} onViewPlace={() => {}}/>);
    expect(html.match(/>View place<\/button>/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<ChatTranscript items={[shared]} partnerName="Sam" busy={false} onReport={() => {}}/>)).not.toContain("View place");
  });
});
