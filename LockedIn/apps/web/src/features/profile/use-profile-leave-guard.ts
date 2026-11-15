"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
declare global {
  interface Window {
    __lockedInProfileHistoryGuard?: (event: PopStateEvent) => void;
  }
}
type NavigationTarget = EventTarget & {
  traverseTo?: (key: string) => {
    committed: Promise<unknown>;
    finished: Promise<unknown>;
  };
};
type TraverseEvent = Event & {
  navigationType?: string;
  destination?: { key?: string; url: string };
};

export function useProfileLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pending = useRef<((leave: boolean) => void) | null>(null),
    approved = useRef(false);
  const restoring = useRef<number | null>(null);
  const confirmLeave = useCallback(() => {
    if (!dirty) return Promise.resolve(true);
    if (pending.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setOpen(true);
    });
  }, [dirty]);
  const decide = useCallback((leave: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    if (!resolve) return;
    approved.current = leave;
    setOpen(false);
    resolve(leave);
  }, []);
  const resetApproval = useCallback(() => {
    approved.current = false;
  }, []);
  useEffect(
    () => () => {
      pending.current?.(false);
      pending.current = null;
    },
    [],
  );
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty && !approved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const navigation = (window as Window & { navigation?: NavigationTarget })
      .navigation;
    const traverse = (event: TraverseEvent) => {
      const destination = event.destination;
      if (
        event.navigationType !== "traverse" ||
        !dirty ||
        approved.current ||
        !destination ||
        !event.cancelable
      )
        return;
      const url = new URL(destination.url, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === "/profile")
        return;
      event.preventDefault();
      void confirmLeave().then((leave) => {
        if (!leave) return;
        if (destination.key && navigation?.traverseTo) {
          const result = navigation.traverseTo(destination.key);
          void result.committed.catch(resetApproval);
          void result.finished.catch(resetApproval);
        } else router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };
    const currentUrl = new URL("/profile", window.location.origin).href,
      currentState = window.history.state;
    const pop = (event: PopStateEvent) => {
      const position = currentState?.__lockedInHistoryPosition;
      const target = event.state?.__lockedInHistoryPosition;
      if (restoring.current !== null) {
        event.stopImmediatePropagation();
        const delta = restoring.current;
        restoring.current = null;
        void confirmLeave().then((leave) => {
          if (leave) window.history.go(-delta);
        });
        return;
      }
      if (
        !dirty ||
        approved.current ||
        new URL(window.location.href).pathname === "/profile"
      )
        return;
      event.stopImmediatePropagation();
      if (
        Number.isInteger(position) &&
        Number.isInteger(target) &&
        position !== target
      ) {
        // Traverse back to the source without replacing or truncating entries.
        restoring.current = position - target;
        window.history.go(position - target);
      } else {
        // Entries from before the bootstrap cannot be positioned reliably.
        const destination = window.location.href;
        window.history.replaceState(currentState, "", currentUrl);
        void confirmLeave().then((leave) => {
          if (leave) router.push(destination);
        });
      }
    };
    window.addEventListener("beforeunload", unload);
    if (navigation) navigation.addEventListener("navigate", traverse);
    else window.__lockedInProfileHistoryGuard = pop;
    return () => {
      window.removeEventListener("beforeunload", unload);
      if (navigation) navigation.removeEventListener("navigate", traverse);
      else if (window.__lockedInProfileHistoryGuard === pop)
        delete window.__lockedInProfileHistoryGuard;
    };
  }, [dirty, confirmLeave, resetApproval, router]);
  return {
    confirmLeave,
    resetApproval,
    dialog: {
      open,
      onConfirm: () => decide(true),
      onCancel: () => decide(false),
    },
  };
}
