"use client";

import { useCallback, useEffect, useState } from "react";
import { JourneyApiError, journeyRequest } from "@/features/journey/journey.client";
import { useQuietRefresh } from "@/features/notifications/use-quiet-refresh";

export const maxTogetherNoteLength = 280;
type Note = { text: string; updatedAt: string };
export type TogetherNotes = { yours: Note | null; partner: Note | null };
type Snapshot = { key: string; data: TogetherNotes | null; error: string };

const accessLost = (error: unknown) => error instanceof JourneyApiError && [401, 403, 404, 409].includes(error.status);

export function useTogetherHomeNotes({ userId, relationshipId, visible, revision, onExpired }: {
  userId?: string;
  relationshipId?: string;
  visible: boolean;
  revision: number;
  onExpired: () => void;
}) {
  const base = visible && relationshipId ? `/api/journey/relationships/${encodeURIComponent(relationshipId)}/home-notes` : null;
  const key = base && userId ? JSON.stringify([userId, base]) : null;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const read = useCallback(async (signal: AbortSignal): Promise<Snapshot | null> => {
    if (!base || !key || !userId) return null;
    const data = await journeyRequest<TogetherNotes>(base, { signal, cache: "no-store", headers: { "X-Together-Owner": userId } });
    return { key, data, error: "" };
  }, [base, key, userId]);
  const apply = useCallback((value: Snapshot | null) => { if (value) setSnapshot(value); }, []);
  const failed = useCallback((error: unknown) => {
    if (!key) return;
    if (error instanceof JourneyApiError && error.status === 401) onExpired();
    setSnapshot(previous => ({
      key, data: accessLost(error) || previous?.key !== key ? null : previous.data,
      error: error instanceof JourneyApiError && error.status === 404 ? "Notes aren’t available in this space." : "Couldn’t load your notes.",
    }));
  }, [key, onExpired]);
  const { invalidate, setBlocked } = useQuietRefresh(read, apply, failed);
  useEffect(() => { if (key) invalidate(); }, [key, invalidate, revision]);
  useEffect(() => {
    if (!key) return;
    const refreshVisible = () => { if (document.visibilityState === "visible") invalidate(); };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    // Recover a partner’s update if the two browsers are on different API instances.
    const timer = window.setInterval(refreshVisible, 30_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [invalidate, key]);

  const share = useCallback(async (text: string) => {
    if (!base || !key || !userId) throw new Error("Notes aren’t available in this space.");
    setBlocked(true);
    try {
      const data = await journeyRequest<TogetherNotes>(base, {
        method: "PUT", body: JSON.stringify({ text }), headers: { "X-Together-Owner": userId },
      });
      setSnapshot(previous => previous?.key !== key ? previous : { key, data, error: "" });
    } catch (error) {
      if (accessLost(error)) failed(error);
      throw error;
    } finally {
      setBlocked(false);
    }
  }, [base, key, userId, failed, setBlocked]);

  const current = snapshot?.key === key ? snapshot : null;
  return { data: current?.data ?? null, error: current?.error ?? "", retry: invalidate, share };
}

export type TogetherHomeNotes = ReturnType<typeof useTogetherHomeNotes>;
