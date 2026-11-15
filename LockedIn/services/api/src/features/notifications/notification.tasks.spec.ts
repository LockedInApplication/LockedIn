import { describe, expect, it } from "vitest";
import { deriveTasks, taskDelta, type NotificationSnapshot } from "./notification.tasks.js";
const empty: NotificationSnapshot = { id: "pair", status: "ACTIVE", members: [{ userId: "a" }, { userId: "b" }], conversationChoices: [], intentionSessions: [], meaningChapters: [] };
const chapter = { id: "chapter", wordKey: "support", status: "COLLECTING", candidateVersion: 0, responses: [], proposals: [], selections: [], finalApprovals: [] };
describe("notification task transitions", () => {
    it("a partner's first meaning replaces the old invitation with a useful response update", () => {
        const before = deriveTasks({ ...empty, meaningChapters: [chapter] });
        const after = deriveTasks({ ...empty, meaningChapters: [{ ...chapter, responses: [{ id: "r1", userId: "a", heardStatus: null }] }] });
        expect(taskDelta(before, after).created.map(t => [t.recipientId, t.kind])).toEqual([["b", "MEANING_SUBMITTED"]]);
    });
    it("creates nothing for a repeated submit with unchanged actionable state", () => {
        const snapshot = { ...empty, meaningChapters: [chapter] };
        expect(taskDelta(deriveTasks(snapshot), deriveTasks(snapshot))).toEqual({ created: [], resolved: [] });
    });
    it("does not notify an ended relationship", () => {
        expect(deriveTasks({ ...empty, status: "ENDED", meaningChapters: [chapter] })).toEqual([]);
    });
    it("replaces conversation suggestions with ready tasks for both when a session starts", () => {
        const before = deriveTasks({ ...empty, conversationChoices: [{ id: "choice", userId: "a", packKey: "intentions" }] });
        const after = deriveTasks({ ...empty, intentionSessions: [{ id: "s", status: "COLLECTING", responses: [], nextSteps: [] }] });
        const delta = taskDelta(before, after);
        expect(delta.resolved).toHaveLength(1);
        expect(delta.created.map(t => [t.recipientId, t.kind])).toEqual([["a", "CONVERSATION_READY"], ["b", "CONVERSATION_READY"]]);
    });
    it("asks for sharing review but never implies automatic check-in reveal", () => {
        const tasks = deriveTasks({ ...empty, intentionSessions: [{ id: "s", status: "READY_TO_REVEAL", responses: [{ userId: "a", revealConsentedAt: null }, { userId: "b", revealConsentedAt: null }], nextSteps: [] }] });
        expect(tasks.map(t => t.kind)).toEqual(["SHARING_READY", "SHARING_READY"]);
    });
    it("only exposes shared ground after both consent", () => {
        const s = { id: "s", status: "REVEALED", responses: [{ userId: "a", revealConsentedAt: new Date() }, { userId: "b", revealConsentedAt: new Date() }], nextSteps: [] };
        expect(deriveTasks({ ...empty, intentionSessions: [s] }).map(t => t.kind)).toEqual(["GROUND_READY", "GROUND_READY"]);
    });
    it("private selections only produce an action for the person who has not chosen", () => {
        const tasks = deriveTasks({ ...empty, meaningChapters: [{ ...chapter, status: "CHOOSING", selections: [{ userId: "a" }] }] });
        expect(tasks.map(t => [t.recipientId, t.kind])).toEqual([["b", "MEANING_CHOICE"]]);
        expect(JSON.stringify(tasks)).not.toContain("proposalId");
    });
    it("new candidate version resolves old approval tasks; two approvals produce completion", () => {
        const c = { ...chapter, status: "PROPOSED", candidateVersion: 2 };
        const delta = taskDelta(deriveTasks({ ...empty, meaningChapters: [c] }), deriveTasks({ ...empty, meaningChapters: [{ ...c, candidateVersion: 3 }] }));
        expect(delta.resolved).toHaveLength(2);
        expect(delta.created).toHaveLength(2);
        expect(deriveTasks({ ...empty, meaningChapters: [{ ...c, status: "SHARED" }] }).map(t => t.kind)).toEqual(["CHAPTER_COMPLETE", "CHAPTER_COMPLETE"]);
    });
    it("notifies only the recipient whose understanding needs checking", () => {
        const c = { ...chapter, status: "CHECKING", responses: [{ id: "r1", userId: "a", heardStatus: "PENDING" }, { id: "r2", userId: "b", heardStatus: null }] };
        expect(deriveTasks({ ...empty, meaningChapters: [c] }).filter(t => t.kind === "HEARD_CHECK").map(t => t.recipientId)).toEqual(["b"]);
    });
    it("step acceptance supersedes proposal; mutual reflections have no outcomes or notes", () => {
        const s = { id: "s", status: "ACTION_CHOSEN", responses: [], nextSteps: [{ id: "step", status: "PROPOSED", proposedById: "a", reflections: [] }] };
        const delta = taskDelta(deriveTasks({ ...empty, intentionSessions: [s] }), deriveTasks({ ...empty, intentionSessions: [{ ...s, nextSteps: [{ ...s.nextSteps[0]!, status: "ACCEPTED" }] }] }));
        expect(delta.created.some(t => t.kind === "STEP_ACCEPTED" && t.recipientId === "a")).toBe(true);
        expect(delta.resolved.some(t => t.kind === "STEP_PROPOSED")).toBe(true);
        const tasks = deriveTasks({ ...empty, intentionSessions: [{ ...s, nextSteps: [{ id: "step", status: "COMPLETED", proposedById: "a", reflections: [{ userId: "a" }, { userId: "b" }] }] }] });
        expect(tasks.filter(t => t.kind === "REFLECTIONS_READY")).toHaveLength(2);
        expect(JSON.stringify(tasks)).not.toMatch(/outcome|note/);
    });
});
