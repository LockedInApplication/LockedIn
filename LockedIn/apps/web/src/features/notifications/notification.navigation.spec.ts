import { describe, expect, it } from "vitest";
import { notificationDestination } from "./notification.navigation";
describe("safe notification destinations", () => {
    it("opens invitation review by ID rather than accepting a token",()=>{
        expect(notificationDestination({view:"invitations",entityId:"invitation-id",wordKey:null})).toBe("/journey?invitation=invitation-id");
    });
    it("selects the relevant meaning chapter without accepting an arbitrary URL", () => {
        expect(notificationDestination({ view: "atlas", entityId: "chapter", wordKey: "space" })).toBe("/journey?view=atlas&chapter=chapter&word=space");
    });
    it("focuses the exact roadmap item", () => {
        expect(notificationDestination({ view: "roadmap", entityId: "step/a", wordKey: null })).toBe("/journey?view=roadmap#step-step%2Fa");
    });
    it("falls back safely for unknown destinations", () => {
        expect(notificationDestination({ view: "https://evil.test", entityId: "x", wordKey: null })).toBe("/journey");
    });
});
