"use client";

import { useEffect } from "react";
import { writeRoom } from "./room-to-talk-api";

export function useRoomRefresh(invalidate: () => void, revision: number) {
  useEffect(() => { invalidate(); }, [invalidate, revision]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") invalidate(); };
    const timer = window.setInterval(visible, 30000);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [invalidate]);
}

export function useTopicPresence(path: string, userId: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    type Lease = { url: string; renewing: boolean; released: boolean };
    let lease: Lease | null = null;
    const release = (prior: Lease) => void writeRoom(prior.url, userId, "DELETE", undefined, true).catch(() => {});
    const stop = () => {
      if (!lease) return;
      const prior = lease;
      lease = null;
      prior.released = true;
      // Also send a release after any in-flight renewal so it can't leave a new lease behind.
      release(prior);
    };
    const sync = () => {
      if (document.visibilityState !== "visible") { stop(); return; }
      lease ??= { url: `${path}/presence/${crypto.randomUUID()}`, renewing: false, released: false };
      const current = lease;
      if (current.renewing) return;
      current.renewing = true;
      void writeRoom(current.url, userId, "PUT").catch(() => {}).finally(() => {
        current.renewing = false;
        if (current.released) release(current);
      });
    };
    sync();
    const timer = window.setInterval(sync, 15000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", stop);
    window.addEventListener("pageshow", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("pageshow", sync);
      stop();
    };
  }, [enabled, path, userId]);
}
