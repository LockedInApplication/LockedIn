"use client";

import { useCallback, useEffect, useState } from "react";
import { JourneyApiError, journeyRequest } from "@/features/journey/journey.client";
import { useQuietRefresh } from "@/features/notifications/use-quiet-refresh";
import { memoryPath, type Memories } from "./memory-api";

type Snapshot = { key: string; gallery: Memories | null; error: string };

export function useTogetherMemories({ userId, relationshipId, visible, polling, revision, onExpired }: {
  userId?: string;
  relationshipId?: string;
  visible: boolean;
  polling: boolean;
  revision: number;
  onExpired: () => void;
}) {
  const base = relationshipId && visible ? memoryPath(relationshipId) : null;
  const key = base && userId ? JSON.stringify([userId, base]) : null;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const read = useCallback(async (signal: AbortSignal): Promise<Snapshot | null> => {
    if (!base || !key) return null;
    const data = await journeyRequest<Memories>(base, { signal, cache: "no-store" });
    return { key, gallery: { ...data, envelopes: data.envelopes ?? [] }, error: "" };
  }, [base, key]);
  const apply = useCallback((value: Snapshot | null) => { if (value) setSnapshot(value); }, []);
  const failed = useCallback((error: unknown) => {
    if (!key) return;
    const status = error instanceof JourneyApiError ? error.status : undefined;
    if (status === 401) onExpired();
    setSnapshot(previous => ({
      key,
      gallery: status === 401 || status === 403 || status === 404 || previous?.key !== key ? null : previous.gallery,
      error: status === 404 ? "Behind the Photo isn’t available in this space." : "Couldn’t load your photos.",
    }));
  }, [key, onExpired]);
  const { invalidate, setBlocked } = useQuietRefresh(read, apply, failed);
  useEffect(() => { if (key) invalidate(); }, [invalidate, key, revision]);
  useEffect(() => {
    if (!key) return;
    const refreshVisible = () => { if (document.visibilityState === "visible") invalidate(); };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    // Preserve cross-instance refresh on the shelf without polling from Home.
    const timer = polling ? window.setInterval(refreshVisible, 30_000) : undefined;
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [invalidate, key, polling]);
  const current = snapshot?.key === key ? snapshot : null;
  return { gallery: current?.gallery ?? null, error: current?.error ?? "", invalidate, setBlocked };
}

export type TogetherMemories = ReturnType<typeof useTogetherMemories>;
