"use client";

import { useSyncExternalStore } from "react";
import { getWorkspaceView, workspaceViewUrl, type WorkspaceView } from "./journey.navigation";

const navigationEvent = "journey-section-change";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(navigationEvent, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(navigationEvent, onChange);
  };
}

function getSnapshot() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function getServerSnapshot() {
  return "/journey";
}

function navigate(view: WorkspaceView) {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const next = workspaceViewUrl(current, view);
  if (next === current) return;
  // Preserve Next's history metadata while changing only the section URL.
  navigateWorkspaceUrl(next);
}

export function navigateWorkspaceUrl(url:string) {
  window.history.pushState(window.history.state,"",url);
  window.dispatchEvent(new Event(navigationEvent));
}

export function useWorkspaceNavigation() {
  const location = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const {search,hash}=new URL(location,"http://localhost");
  const activeView=getWorkspaceView(search,hash);
  return [activeView, navigate, location] as const;
}
