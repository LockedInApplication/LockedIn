import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Chat, { ChatTranscript } from "./Chat";
import MessageActions from "./MessageActions";
import { notificationDestination } from "../notifications/notification.navigation";
import NotificationPanel from "../notifications/NotificationPanel";

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
  it("groups consecutive text messages but preserves each message, its timestamp and its report action", () => {
    const messages = ["2026-11-17T12:00:00Z", "2026-11-17T12:01:00Z", "2026-11-17T12:01:01Z", "2026-11-18T12:02:00Z"].map((createdAt, index) => ({
      id: `message-${index}`, sequence: String(index + 1), author: "partner" as const, text: `Text ${index}`, createdAt,
      ...(index === 2 ? { dateSpot: true as const } : {}),
    }));
    const html = renderToStaticMarkup(<ChatTranscript items={messages} partnerName="Sam" busy={false} onReport={() => {}}/>);
    expect(html.match(/data-grouped="true"/g)).toHaveLength(1);
    expect(html).toMatch(/data-message-id="message-1"[^>]*data-grouped="true"/);
    expect(html.match(/data-message-id=/g)).toHaveLength(4);
    expect(html.match(/<time /g)).toHaveLength(4);
    expect(html.match(/aria-label="Message actions"/g)).toHaveLength(4);
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
  it("offers a single planner control before the transcript only when scheduling is available", () => {
    const chat = { conversationId: "direct", userId: "a", partner: { publicName: "Sam", avatarPreset: "leaf" }, onAccessEnded: () => {} };
    const sheet = renderToStaticMarkup(<Chat {...chat} datePlansConversationId="direct"/>);
    expect(sheet.match(/>Plan a date<\/button>/g)).toHaveLength(1);
    expect(sheet.indexOf(">Plan a date</button>")).toBeLessThan(sheet.indexOf("Loading messages"));
    expect(renderToStaticMarkup(<Chat {...chat}/>)).not.toContain(">Plan a date</button>");
  });
  it("renders one compact invite linking the original plan, not the time or later transitions", () => {
    const received = { id: "invite", sequence: "1", author: "partner" as const, text: "Suggested a date time.", createdAt: "2026-11-19T12:00:00Z" };
    const date = { id: "old-plan", sourceMessageId: received.id, venueName: "Unexpected Venue", startsAt: "2026-11-21T12:00:00Z", timeZone: "UTC", revision: 1, state: "pending" as const };
    const html = renderToStaticMarkup(<ChatTranscript items={[
      { ...received, datePlanEvent: { ...date, action: "propose" } },
      { ...received, id: "confirm", sequence: "2", text: "Confirmed the date.", datePlanEvent: { ...date, action: "confirm", state: "confirmed" } },
    ]} partnerName="Sam" busy={false} onReport={() => {}} onOpenDate={() => {}}/>);
    expect(html).toContain("Open date invite");
    expect(html).toContain("data-plan-id=\"old-plan\"");
    expect(html).not.toMatch(/Unexpected Venue|Confirmed the date|2026-11-21/);
  });
  it("lists date updates separately and opens the exact plan without exposing details", () => {
    const noop = () => {};
    const dates = [{ conversationId: "conversation", discoveryConnectionId: "discovery", planId: "old-plan" }];
    const html = renderToStaticMarkup(<NotificationPanel items={[]} loading={false} error={null} connection="live" nextCursor={null} onRetry={noop}
      onMore={noop} onOpen={noop} onClose={noop} unreadDates={dates}/>);
    expect(html).toContain("<h3>Date update</h3>");
    expect(html).not.toMatch(/New message|all caught up/);
    expect(notificationDestination({ view: "discovery", entityId: "discovery", wordKey: null, planId: "old-plan" })).toBe("/connections/discovery?date=old-plan");
    expect(notificationDestination({ view: "messages", entityId: "conversation", wordKey: null, planId: "old-plan" })).toBe("/messages/conversation?date=old-plan");
  });
});
