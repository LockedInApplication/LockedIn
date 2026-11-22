import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import InvitationReviewContent from "./InvitationReviewContent";
const pending = { id: "invite", token: "private-token", inviterName: "Abena", status: "PENDING", expiresAt: "2026-11-22T12:00:00Z", canRespond: true, blockedReason: null };
const callbacks = { onClose: () => { }, onRetry: () => { }, onDecision: () => { } };
describe("explicit invitation review", () => {
    it("says exactly what a new direct invitation opens", () => {
        const html = renderToStaticMarkup(<InvitationReviewContent {...callbacks} data={{ ...pending, chatFirst: true }} loading={false} busy={false} error={null}/>);
        expect(html).toContain("Accept and chat");
        expect(html).toContain("doesn’t lock you in or pause Discovery");
        expect(html).not.toContain("invited you to build a private shared space");
    });
    it("explains decline visibility and offers a separate private invitation block",()=>{
        const html=renderToStaticMarkup(<InvitationReviewContent {...callbacks} data={{...pending,canBlock:true}} loading={false} busy={false} error={null}/>);
        expect(html).toContain("sender can see");expect(html).toContain("7 days");expect(html).toContain("Block invitation sender");expect(html).toContain("won’t be told");
    });
    it("offers separate accept and decline actions without exposing a bearer token", () => {
        const html = renderToStaticMarkup(<InvitationReviewContent {...callbacks} data={pending} loading={false} busy={false} error={null}/>);
        expect(html).toContain("Abena");
        expect(html).toContain("Accept invitation");
        expect(html).toContain("Decline");
        expect(html).toContain("does not reveal");
        expect(html).not.toContain("private-token");
    });
    it.each(["EXPIRED", "ACCEPTED", "DECLINED"])("does not offer acceptance for %s", status => {
        const html = renderToStaticMarkup(<InvitationReviewContent {...callbacks} data={{ ...pending, status, canRespond: false }} loading={false} busy={false} error={null}/>);
        expect(html).not.toContain("Accept invitation");
        expect(html).toContain(status === "EXPIRED" ? "expired" : status === "ACCEPTED" ? "accepted" : "declined");
    });
    it("explains an existing connection and disables acceptance", () => {
        const html = renderToStaticMarkup(<InvitationReviewContent {...callbacks} data={{ ...pending, canRespond: false, blockedReason: "You already have a shared space." }} loading={false} busy={false} error={null}/>);
        expect(html).toContain("You already have a shared space.");
        expect(html).toMatch(/<button[^>]*disabled[^>]*>Accept invitation/);
    });
    it("provides retry without an acceptance control after a load error", () => {
        const html = renderToStaticMarkup(<InvitationReviewContent {...callbacks} data={null} loading={false} busy={false} error="Unable to load invitation."/>);
        expect(html).toContain("Try again");
        expect(html).not.toContain("Accept invitation");
    });
});
