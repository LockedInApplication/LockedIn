export type NotificationSnapshot = {
    id: string;
    status: string;
    members: {
        userId: string;
    }[];
    conversationChoices: {
        id: string;
        userId: string;
        packKey: string | null;
    }[];
    intentionSessions: {
        id: string;
        status: string;
        responses: {
            userId: string;
            revealConsentedAt: Date | null;
        }[];
        nextSteps: {
            id: string;
            status: string;
            proposedById: string;
            reflections: {
                userId: string;
            }[];
        }[];
    }[];
    meaningChapters: {
        id: string;
        wordKey: string;
        status: string;
        candidateVersion: number;
        responses: {
            id: string;
            userId: string;
            heardStatus: string | null;
        }[];
        proposals: {
            userId: string | null;
            kind: string;
        }[];
        selections: {
            userId: string;
        }[];
        finalApprovals: {
            userId: string;
            candidateVersion: number;
        }[];
    }[];
};
export type NotificationTask = {
    recipientId: string;
    relationshipId: string | null;
    discoveryConnectionId?: string;
    kind: string;
    entityId: string;
    wordKey: string | null;
    eventKey: string;
};
export function deriveTasks(snapshot: NotificationSnapshot): NotificationTask[] {
    if (snapshot.status !== "ACTIVE" || snapshot.members.length !== 2)
        return [];
    const tasks: NotificationTask[] = [];
    const add = (recipientId: string, kind: string, entityId: string, version = "", wordKey: string | null = null) => {
        tasks.push({ recipientId, relationshipId: snapshot.id, kind, entityId, wordKey, eventKey: JSON.stringify([recipientId, kind, entityId, version]) });
    };
    for (const { userId } of snapshot.members) {
        for (const choice of snapshot.conversationChoices) {
            if (choice.userId !== userId)
                add(userId, "CONVERSATION_CHOICE", snapshot.id, `${choice.id}:${choice.packKey ?? "either"}`);
        }
        for (const session of snapshot.intentionSessions) {
            if (session.status === "ARCHIVED")
                continue;
            const own = session.responses.find(r => r.userId === userId);
            if (!own)
                add(userId, "CONVERSATION_READY", session.id);
            else if (session.responses.length === 2 && !own.revealConsentedAt)
                add(userId, "SHARING_READY", session.id);
            else if (session.responses.length === 2 && session.responses.every(r => r.revealConsentedAt) && !session.nextSteps.length)
                add(userId, "GROUND_READY", session.id);
            for (const step of session.nextSteps) {
                if (step.status === "PROPOSED" && step.proposedById !== userId)
                    add(userId, "STEP_PROPOSED", step.id);
                else if (step.status === "ACCEPTED" && step.proposedById === userId)
                    add(userId, "STEP_ACCEPTED", step.id);
                if (step.reflections.length === 2)
                    add(userId, "REFLECTIONS_READY", step.id);
            }
        }
        for (const c of snapshot.meaningChapters) {
            const word = c.wordKey;
            const emit = (kind: string, version = "") => add(userId, kind, c.id, version, word);
            const own = c.responses.find(r => r.userId === userId);
            const partner = c.responses.find(r => r.userId !== userId);
            if (c.status === "SHARED")
                emit("CHAPTER_COMPLETE", String(c.candidateVersion));
            else if (c.status === "COLLECTING") {
                if (!own)
                    emit(c.responses.length ? "MEANING_SUBMITTED" : "CHAPTER_STARTED");
            }
            else if (c.status === "DISCOVERING" || c.status === "CHECKING") {
                if (partner?.heardStatus === "PENDING")
                    emit("HEARD_CHECK");
                if (own && (!own.heardStatus || ["ALMOST", "MISSING"].includes(own.heardStatus)))
                    emit("MEANING_LISTEN", own.heardStatus ?? "");
                if (own?.heardStatus === "CONFIRMED" && partner?.heardStatus === "CONFIRMED" && !c.proposals.some(p => p.userId === userId && p.kind === "PERSONAL"))
                    emit("MEANING_PROPOSE");
            }
            else if (c.status === "PROPOSING") {
                if (!c.proposals.some(p => p.userId === userId && p.kind === "PERSONAL"))
                    emit("MEANING_PROPOSE");
            }
            else if (c.status === "CHOOSING") {
                if (!c.selections.some(s => s.userId === userId))
                    emit("MEANING_CHOICE");
            }
            else if (c.status === "RESOLVING")
                emit("MEANING_RESOLVE", String(c.candidateVersion));
            else if (c.status === "PROPOSED" && !c.finalApprovals.some(a => a.userId === userId && a.candidateVersion === c.candidateVersion))
                emit("MEANING_APPROVE", String(c.candidateVersion));
        }
    }
    return tasks;
}
export function taskDelta(before: NotificationTask[], after: NotificationTask[]) {
    return { created: after.filter(t => !before.some(b => b.eventKey === t.eventKey)), resolved: before.filter(t => !after.some(a => a.eventKey === t.eventKey)) };
}
