"use client";
import { useCallback, useRef, useSyncExternalStore } from "react";
const query = "(max-width: 700px)";
function subscribe(update: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}
export function useCompactWorkspace() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Follow the same action when responsive layout moves it to another DOM slot. */
export function useResponsiveActionRef() {
  const previous = useRef<{ node: HTMLElement; compact: boolean } | null>(null);
  const restore = useRef(false);
  return useCallback((node: HTMLElement | null) => {
    const compact = window.matchMedia(query).matches;
    if (!node) {
      const old = previous.current;
      restore.current = !!old && old.compact !== compact && old.node.contains(document.activeElement);
      previous.current = null;
      return;
    }
    previous.current = { node, compact };
    if (restore.current) node.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    restore.current = false;
  }, []);
}
