"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { JourneyApiError } from "@/lib/journey";
import { messagingRequest } from "./messaging.client";
import { signalChatRefresh, useChatRefresh } from "./use-chat-refresh";
import type { DatePlanAction, DatePlanReply, DatePlanUpdate, DatePlanView } from "./date-plans.types";

export function useDatePlans(userId: string, conversationId: string | undefined, beforePlanChange: () => void) {
  const path = conversationId ? "/api/messaging/conversations/" + conversationId + "/date-plans" : null;
  const key = userId + ":" + path;
  const [snapshot, setSnapshot] = useState<{ key: string; plan: DatePlanView | null; unread: DatePlanUpdate | null; sharedSearchRequested: boolean }>();
  const installed = useRef<typeof snapshot>(undefined);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ key: string; message: string }>();
  const [summaryProblem, setSummaryProblem] = useState<string>();
  const [summaryVerified, setSummaryVerified] = useState<string>();
  const errorScope = useRef(0);
  const lifetime = useRef<AbortController | null>(null);
  const reading = useRef<AbortController | null>(null);
  const writing = useRef<AbortController | null>(null);
  const retry = useRef<{ key: string; payload: string; requestId: string } | null>(null);
  const clearError = useCallback(() => {
    errorScope.current++;
    setProblem(undefined);
  }, []);

  useEffect(() => {
    const current = new AbortController();
    lifetime.current = current;
    return () => {
      current.abort();
      reading.current?.abort();
      reading.current = null;
      writing.current = null;
    };
  }, [key]);

  const install = useCallback((plan: DatePlanView | null, update?: { unreadUpdate: DatePlanUpdate | null; sharedSearchRequested?: boolean }) => {
    const previous = installed.current;
    const unread = update ? update.unreadUpdate : previous?.key === key ? previous.unread : null;
    const sharedSearchRequested = update ? !!update.sharedSearchRequested : previous?.key === key && previous.sharedSearchRequested;
    const samePlan = previous?.key === key && previous.plan?.id === plan?.id && previous.plan?.revision === plan?.revision && previous.plan?.state === plan?.state;
    if (samePlan && previous.unread?.planId === unread?.planId && previous.unread?.action === unread?.action && previous.sharedSearchRequested === sharedSearchRequested) return;
    if (!samePlan) beforePlanChange();
    const next = { key, plan, unread, sharedSearchRequested };
    installed.current = next;
    setSnapshot(next);
  }, [beforePlanChange, key]);

  const refresh = useCallback(() => {
    if (!path || !lifetime.current || reading.current || writing.current) return;
    const controller = new AbortController();
    reading.current = controller;
    const { signal } = controller;
    void messagingRequest<{ activePlan: DatePlanView | null; unreadUpdate: DatePlanUpdate | null; sharedSearchRequested?: boolean }>(userId, path + "?presentation=sheet", { signal }).then(result => {
      if (!signal.aborted) {
        install(result.activePlan, result);
        setSummaryProblem(undefined);
        setSummaryVerified(key);
      }
    }).catch(error => {
      if (signal.aborted) return;
      if (error instanceof JourneyApiError && [401, 403, 404, 409].includes(error.status)) {
        install(null, { unreadUpdate: null });
      }
      setSummaryProblem(key);
    }).finally(() => {
      if (reading.current === controller) reading.current = null;
    });
  }, [install, key, path, userId]);
  useChatRefresh({ userId, onRefresh: refresh });

  const act = useCallback(async (action: DatePlanAction) => {
    const controller = lifetime.current;
    if (!path || !controller || writing.current) return null;
    reading.current?.abort();
    reading.current = null;
    writing.current = controller;
    const { signal } = controller;
    const scope = errorScope.current;
    const payload = JSON.stringify(action);
    if (retry.current?.key !== key || retry.current.payload !== payload) retry.current = { key, payload, requestId: crypto.randomUUID() };
    setBusyKey(key); setProblem(undefined);
    try {
      const reply = await messagingRequest<DatePlanReply>(userId, path, { method: "POST", body: JSON.stringify({ ...action, requestId: retry.current.requestId }), signal });
      if (signal.aborted) return null;
      retry.current = null;
      install(reply.activePlan);
      signalChatRefresh(userId);
      return reply;
    } catch (error) {
      if (!signal.aborted) {
        if (error instanceof JourneyApiError && error.status === 409) {
          retry.current = null;
          install(null);
          signalChatRefresh(userId);
        }
        if (errorScope.current === scope) {
          setProblem({ key, message: error instanceof Error ? error.message : "Could not update the date plan. Try again." });
        }
      }
      return null;
    } finally {
      if (writing.current === controller) writing.current = null;
      if (!signal.aborted) { setBusyKey(null); refresh(); }
    }
  }, [install, key, path, refresh, userId]);

  const exportCalendar = useCallback(async (planId: string) => {
    const signal = lifetime.current?.signal;
    if (!path || !signal) return;
    const scope = errorScope.current;
    setProblem(undefined);
    try {
      const { contents, filename } = await messagingRequest<{ contents: string; filename: string }>(userId, path + "/" + encodeURIComponent(planId) + "/calendar", { signal });
      if (signal.aborted) return;
      const url = URL.createObjectURL(new Blob([contents], { type: "text/calendar;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!signal.aborted) {
        if (errorScope.current === scope) {
          setProblem({ key, message: error instanceof Error ? error.message : "Could not download the calendar file. Try again." });
        }
        refresh();
      }
    }
  }, [key, path, userId, refresh]);

  return {
    activePlan: path && snapshot?.key === key ? snapshot.plan : null,
    unreadUpdate: path && snapshot?.key === key ? snapshot.unread : null,
    sharedSearchRequested: !!(path && snapshot?.key === key && snapshot.sharedSearchRequested),
    summaryStatus: summaryProblem === key ? "unavailable" as const : summaryVerified === key ? "ready" as const : "loading" as const,
    error: path && problem?.key === key ? problem.message : "",
    busy: path !== null && busyKey === key, refresh, act, exportCalendar,
    clearError,
  };
}
