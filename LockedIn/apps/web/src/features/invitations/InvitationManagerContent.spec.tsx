import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SentInvitationCards, OwnedInvitationBlocks } from "./InvitationManagerContent";
const invite = { id: "invite", toEmail: "partner@example.test", status: "PENDING" as const, createdAt: "2026-11-15T12:00:00Z", expiresAt: null, canWithdraw: true };
describe("sender status and private block controls", () => {
    it("offers withdrawal only for a pending invite", () => { const html = renderToStaticMarkup(<SentInvitationCards items={[invite]} busy={false} onWithdraw={() => { }}/>); expect(html).toContain("Invitation pending"); expect(html).toContain("Withdraw invitation"); });
    it("shows a neutral not-accepted state with no block/reason or retry control", () => { const html = renderToStaticMarkup(<SentInvitationCards items={[{ ...invite, status: "NOT_ACCEPTED", canWithdraw: false }]} busy={false} onWithdraw={() => { }}/>); expect(html).toContain("Invitation not accepted"); expect(html).not.toMatch(/blocked|declined|Withdraw invitation|Resend/); });
    it("gives the blocker explicit control without promising reconnection", () => { const html = renderToStaticMarkup(<OwnedInvitationBlocks items={[{ id: "block", name: "Account A", createdAt: invite.createdAt }]} busy={false} onUnblock={() => { }}/>); expect(html).toContain("Account A"); expect(html).toContain("Unblock invitations"); expect(html).toContain("does not reconnect"); });
});
