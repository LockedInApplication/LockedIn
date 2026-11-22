"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { JourneyApiError } from "@/features/journey/journey.client";
import { fetchInvitationReview, respondToInvitation } from "./invitation-review.client";
import type { InvitationAcceptance, InvitationReviewData,InvitationDecision } from "./invitation-review.types";
import InvitationReviewContent from "./InvitationReviewContent";
export default function InvitationReview({ reference, by, onHandled, onClose }: {
    reference: string;
    by: "id" | "token";
    onHandled: (decision: InvitationDecision, acceptance: InvitationAcceptance) => Promise<void>;
    onClose: () => void;
}) {
    const [data, setData] = useState<InvitationReviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abort = useRef<AbortController | null>(null);
    const saving = useRef(false);
    const load = useCallback(async () => {
        const signal = abort.current?.signal;
        if (!signal || signal.aborted)
            return;
        setLoading(true);
        try {
            const result = await fetchInvitationReview(reference, by, signal);
            if (signal.aborted)
                return;
            setData(result);
            setError(null);
        }
        catch (e) {
            if (signal.aborted)
                return;
            setData(null);
            setError(e instanceof JourneyApiError && e.status === 404 ? "This invitation is unavailable. Sign in with the email address it was sent to, or ask for a new invitation." : "We couldn’t load this invitation. Please try again.");
        }
        finally {
            if (!signal.aborted)
                setLoading(false);
        }
    }, [reference, by]);
    useEffect(() => {
        const controller = new AbortController();
        abort.current = controller;
        void load();
        const node = document.getElementById("invitation-review");
        node?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        node?.focus({ preventScroll: true });
        return () => { controller.abort(); abort.current = null; };
    }, [load]);
    async function decide(decision: InvitationDecision) {
        const signal = abort.current?.signal;
        if (!data || !signal || saving.current)
            return;
        if(decision==="block" && !window.confirm("Block invitations with this person until you unblock them? They won’t be told you blocked them. Existing shared spaces will not be changed."))return;
        saving.current = true;
        setBusy(true);
        setError(null);
        try {
            const result = await respondToInvitation(data.token, decision, signal);
            if (!signal.aborted)
                await onHandled(decision, result);
        }
        catch (e) {
            if (signal.aborted)
                return;
            await load();
            if (!signal.aborted)
                setError(e instanceof Error ? e.message : "This invitation could not be updated.");
        }
        finally {
            saving.current = false;
            if (!signal.aborted)
                setBusy(false);
        }
    }
    return <InvitationReviewContent data={data} loading={loading} busy={busy} error={error} onDecision={decide} onClose={onClose} onRetry={() => void load()}/>;
}
