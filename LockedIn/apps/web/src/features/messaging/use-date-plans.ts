"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { JourneyApiError } from "@/lib/journey";
import { messagingRequest } from "./messaging.client";
import { signalChatRefresh, useChatRefresh } from "./use-chat-refresh";
import type { DatePlanAction, DatePlanReply, DatePlanView } from "./date-plans.types";

export function useDatePlans(userId: string, conversationId?: string) {
  const path = conversationId ? "/api/messaging/conversations/" + conversationId + "/date-plans" : null;
  const key = userId + ":" + path;
  const [snapshot, setSnapshot] = useState<{ key: string; plan: DatePlanView | null }>();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ key: string; message: string }>();
  const lifetime = useRef<AbortController | null>(null);
  const reading = useRef<AbortController | null>(null);
  const writing = useRef<AbortController | null>(null);
  const retry = useRef<{ key: string; payload: string; requestId: string } | null>(null);

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

  const refresh = useCallback(() => {
    if (!path || !lifetime.current || reading.current || writing.current) return;
    const controller = new AbortController();
    reading.current = controller;
    const { signal } = controller;
    void messagingRequest<{ activePlan: DatePlanView | null }>(userId, path, { signal }).then(result => {
      if (!signal.aborted) setSnapshot({ key, plan: result.activePlan });
    }).catch(error => {
      if (signal.aborted) return;
      if (error instanceof JourneyApiError && [401, 403, 404, 409].includes(error.status)) {
        setSnapshot({ key, plan: null });
      }
    }).finally(() => {
      if (reading.current === controller) reading.current = null;
    });
  }, [key, path, userId]);
  useChatRefresh({ userId, onRefresh: refresh });

  const act = useCallback(async (action: DatePlanAction) => {
    const controller = lifetime.current;
    if (!path || !controller || writing.current) return null;
    reading.current?.abort();
    reading.current = null;
    writing.current = controller;
    const { signal } = controller;
    const payload = JSON.stringify(action);
    if (retry.current?.key !== key || retry.current.payload !== payload) retry.current = { key, payload, requestId: crypto.randomUUID() };
    setBusyKey(key); setProblem(undefined);
    try {
      const reply = await messagingRequest<DatePlanReply>(userId, path, { method: "POST", body: JSON.stringify({ ...action, requestId: retry.current.requestId }), signal });
      if (signal.aborted) return null;
      retry.current = null;
      setSnapshot({ key, plan: reply.activePlan });
      signalChatRefresh(userId);
      return reply;
    } catch (error) {
      if (!signal.aborted) {
        if (error instanceof JourneyApiError && error.status === 409) {
          retry.current = null;
          setSnapshot({ key, plan: null });
          signalChatRefresh(userId);
        }
        setProblem({ key, message: error instanceof Error ? error.message : "Could not update the date plan. Try again." });
      }
      return null;
    } finally {
      if (writing.current === controller) writing.current = null;
      if (!signal.aborted) { setBusyKey(null); refresh(); }
    }
  }, [key, path, refresh, userId]);

  const exportCalendar = useCallback(async (planId: string) => {
    const signal = lifetime.current?.signal;
    if (!path || !signal) return;
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
        setProblem({ key, message: error instanceof Error ? error.message : "Could not download the calendar file. Try again." });
        refresh();
      }
    }
  }, [key, path, userId, refresh]);

  return {
    activePlan: path && snapshot?.key === key ? snapshot.plan : null,
    error: path && problem?.key === key ? problem.message : "",
    busy: path !== null && busyKey === key, refresh, act, exportCalendar,
    clearError: () => setProblem(undefined),
  };
}
