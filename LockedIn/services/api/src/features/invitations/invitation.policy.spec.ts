import { describe, expect, it } from "vitest";
import { declinePauseActive, senderInvitationStatus } from "./invitation.policy.js";
describe("invitation policy", () => {
    const now = Date.parse("2026-11-15T12:00:00Z");
    it.each([["2026-11-08T12:00:00.001Z", true], ["2026-11-08T12:00:00Z", false], ["2026-11-08T11:59:59.999Z", false]])("uses an exact seven-day pause for %s", (date, expected) => expect(declinePauseActive(new Date(date as string), now)).toBe(expected));
    it("does not turn an absent decline into a pause", () => expect(declinePauseActive(null, now)).toBe(false));
    it.each([["PENDING", "2026-11-16T12:00:00Z", "PENDING"], ["PENDING", "2026-11-14T12:00:00Z", "EXPIRED"], ["DECLINED", null, "NOT_ACCEPTED"], ["CANCELED", null, "WITHDRAWN"], ["ACCEPTED", null, "ACCEPTED"]])("projects %s without exposing the reason", (status, expiresAt, expected) => expect(senderInvitationStatus({ status: status!, expiresAt: expiresAt ? new Date(expiresAt) : null }, now)).toBe(expected));
});
