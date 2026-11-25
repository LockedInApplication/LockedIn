"use client";
import { useEffect, type RefObject } from "react";
const warning =
  "You have unsaved changes. Leave them and load the latest activity?";
/** Block history traversal before Next or workspace subscribers unmount a draft. */
export function useJourneyHistoryGuard(dirty: RefObject<boolean>, setDirty: (value: boolean) => void) {
  useEffect(() => {
    const approve = () => {
      if (!dirty.current) return true;
      if (!window.confirm(warning)) return false;
      setDirty(false);
      return true;
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    const navigate = (event: Event) => {
      const e = event as Event & {
        navigationType?: string;
        destination?: { url: string };
      };
      if (
        e.navigationType !== "traverse" ||
        !e.cancelable ||
        e.destination?.url === location.href
      )
        return;
      if (!approve()) e.preventDefault();
    };
    let source = Number(history.state?.__lockedInHistoryPosition ?? 0),
      restoring = false;
    const updateSource = () => {
      source = Number(history.state?.__lockedInHistoryPosition ?? source);
    };
    const pop = (event: PopStateEvent) => {
      if (restoring) {
        event.stopImmediatePropagation();
        restoring = false;
        return;
      }
      const target = Number(event.state?.__lockedInHistoryPosition);
      if (!approve()) {
        event.stopImmediatePropagation();
        if (Number.isFinite(target) && target !== source) {
          restoring = true;
          history.go(source - target);
        }
      } else if (Number.isFinite(target)) source = target;
    };
    if (!navigation) window.__lockedInProfileHistoryGuard = pop;
    navigation?.addEventListener("navigate", navigate);
    window.addEventListener("beforeunload", unload);
    window.addEventListener("journey-section-change", updateSource);
    return () => {
      if (window.__lockedInProfileHistoryGuard === pop)
        delete window.__lockedInProfileHistoryGuard;
      navigation?.removeEventListener("navigate", navigate);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("journey-section-change", updateSource);
    };
  }, [dirty, setDirty]);
}
