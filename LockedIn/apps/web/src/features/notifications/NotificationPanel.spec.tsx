import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NotificationPanel from "./NotificationPanel";
const props = { items: [], loading: false, error: null, connection: "live" as const, nextCursor: null, onRetry: () => { }, onMore: () => { }, onOpen: () => { }, onClose: () => { } };
describe("notification inbox", () => {
    it("has an accessible empty state and close control", () => {
        const html = renderToStaticMarkup(<NotificationPanel {...props}/>);
        expect(html).toContain('aria-label="Notifications"');
        expect(html).toContain("You’re all caught up");
        expect(html).toContain('aria-label="Close notifications"');
    });
    it("keeps completed notifications as non-actionable history", () => {
        const html = renderToStaticMarkup(<NotificationPanel {...props} items={[{ id: "1", kind: "MEANING_APPROVE", entityId: "c", wordKey: "support", view: "atlas", title: "Review shared wording", message: "Review together", createdAt: "2026-11-15T12:00:00Z", readAt: null, resolvedAt: "2026-11-15T13:00:00Z" }]}/>);
        expect(html).toContain("Already completed or updated");
        expect(html).not.toContain("Open activity");
    });
    it("offers retry when fetching fails", () => {
        const html = renderToStaticMarkup(<NotificationPanel {...props} error="Notifications could not load."/>);
        expect(html).toContain("Try again");
        expect(html).not.toContain("You’re all caught up");
    });
    it("shows one generic chat action even if an unread entry repeats", () => {
        const item = { conversationId: "chat", discoveryConnectionId: null };
        const html = renderToStaticMarkup(<NotificationPanel {...props} unreadChats={[item,item]} onOpenChat={() => {}}/>);
        expect(html.match(/>New message</g)).toHaveLength(1);
        expect(html).toContain("Open chat");
        expect(html).not.toContain("You’re all caught up");
    });
});
