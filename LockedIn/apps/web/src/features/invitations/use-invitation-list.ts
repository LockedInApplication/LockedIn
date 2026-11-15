"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchInvitationPage, updateInvitationSetting } from "./invitation-management.client";
import type { InvitationPage } from "./invitation-management.types";
export function useInvitationList<T extends {
    id: string;
}>(path: string, revision: number) {
    const [page, setPage] = useState<InvitationPage<T>>({ items: [], nextCursor: null });
    const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const controller = useRef<AbortController | null>(null), requestId = useRef(0), saving = useRef(false);
    const load = useCallback(async (before?: string) => {
        const signal = controller.current?.signal;
        if (!signal || signal.aborted)
            return;
        const current = ++requestId.current;
        setLoading(true);
        try {
            const data = await fetchInvitationPage<T>(path, signal, before);
            if (signal.aborted || current !== requestId.current)
                return;
            setPage(old => before ? { ...data, items: [...old.items, ...data.items.filter(item => !old.items.some(prev => prev.id === item.id))] } : data);
            setError(null);
        }
        catch (e) {
            if (!signal.aborted && current === requestId.current)
                setError(e instanceof Error ? e.message : "Invitations could not load.");
        }
        finally {
            if (!signal.aborted && current === requestId.current)
                setLoading(false);
        }
    }, [path]);
    useEffect(() => {
        const abort = new AbortController();
        controller.current = abort;
        void load();
        const timer = setInterval(() => { if (document.visibilityState === "visible")
            void load(); }, 30000);
        return () => { abort.abort(); controller.current = null; clearInterval(timer); };
    }, [load]);
    useEffect(() => { if (revision > 0)
        void load(); }, [revision, load]);
    async function mutate(endpoint: string, method: "POST" | "DELETE") {
        const signal = controller.current?.signal;
        if (!signal || saving.current)
            return;
        saving.current = true;
        setBusy(true);
        setError(null);
        try {
            await updateInvitationSetting(endpoint, method, signal);
            await load();
        }
        catch (e) {
            if (!signal.aborted)
                setError(e instanceof Error ? e.message : "This invitation could not be updated.");
        }
        finally {
            saving.current = false;
            if (!signal.aborted)
                setBusy(false);
        }
    }
    return { ...page, loading, busy, error, reload: () => void load(), more: () => void load(page.nextCursor ?? undefined), mutate };
}
