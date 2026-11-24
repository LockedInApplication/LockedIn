import { describe, expect, it } from "vitest";
import { notificationDestination } from "./notification.navigation";
it("takes check-in activity into the existing check-in, while an accepted invite opens Together normally", () => {
    for (const kind of ["CONVERSATION_READY", "SHARING_READY", "GROUND_READY"]) {
        expect(notificationDestination({ view: "home", kind, entityId: "session", wordKey: null })).toBe("/journey?view=check-ins#current-action");
    }
    expect(notificationDestination({ view: "home", kind: "INVITATION_ACCEPTED", entityId: "invite", wordKey: null })).toBe("/journey");
});
it("routes direct unread messages to their conversation, with encoded IDs", () => {
    expect(notificationDestination({view:"messages",entityId:"a/b",wordKey:null})).toBe("/messages/a%2Fb");
});
describe("safe notification destinations", () => {
    it("opens the exact isolated discovery connection",()=>{
        expect(notificationDestination({view:"discovery",entityId:"connection-id",wordKey:null})).toBe("/connections/connection-id");
        expect(notificationDestination({view:"discovery",entityId:"a/b",wordKey:null})).toBe("/connections/a%2Fb");
    });
    it("opens invitation review by ID rather than accepting a token",()=>{
        expect(notificationDestination({view:"invitations",entityId:"invitation-id",wordKey:null})).toBe("/journey?invitation=invitation-id");
    });
    it("selects the relevant meaning chapter without accepting an arbitrary URL", () => {
        expect(notificationDestination({ view: "atlas", entityId: "chapter", wordKey: "space" })).toBe("/journey?view=atlas&chapter=chapter&word=space");
    });
    it("focuses the exact roadmap item", () => {
        expect(notificationDestination({ view: "roadmap", entityId: "step/a", wordKey: null })).toBe("/journey?view=roadmap#step-step%2Fa");
    });
    it("opens the exact Room to Talk topic for either kind of update", () => {
        for (const kind of ["ROOM_TALK_SUGGESTED", "ROOM_TALK_IN_PERSON"]) {
            expect(notificationDestination({ view: "room-to-talk", kind, entityId: "topic/a", wordKey: null })).toBe("/journey?view=room-to-talk&topic=topic%2Fa");
        }
    });
    it("falls back safely for unknown destinations", () => {
        expect(notificationDestination({ view: "https://evil.test", entityId: "x", wordKey: null })).toBe("/journey");
    });
});
