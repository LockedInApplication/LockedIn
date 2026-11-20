"use client";
import { useCallback, useEffect, useRef } from "react";
import { signalUnreadChats } from "../notifications/message-alerts.client";
import { messagingRequest } from "./messaging.client";

export function useChatRead(userId: string, conversationId: string, displayedSequence: () => string | null) {
  const active = useRef<{ controller: AbortController; through: bigint; sending: boolean; pending: boolean } | null>(null);
  useEffect(() => {
    const state = { controller:new AbortController(), through:BigInt(0), sending:false, pending:false };
    active.current = state;
    return () => { state.controller.abort(); active.current = null; };
  },[userId,conversationId]);
  return useCallback(function check() {
    const state = active.current, through = displayedSequence();
    if (!state || !through || BigInt(through) <= state.through) return;
    if (state.sending) { state.pending = true; return; }
    const { signal } = state.controller;
    state.sending = true;
    let acknowledged = false;
    void messagingRequest<{ through:string }>(userId,`/api/messaging/conversations/${conversationId}/read`,{
      method:"POST", body:JSON.stringify({through}),signal,
    }).then(value => {
      if (signal.aborted) return;
      state.through = BigInt(value.through);
      acknowledged = true;
      signalUnreadChats(userId);
    }).catch(() => { /* Recheck on the next visible sync or scroll. */ }).finally(() => {
      const pending = state.pending;
      state.pending = false; state.sending = false;
      if (acknowledged && pending && !signal.aborted) check();
    });
  },[conversationId,displayedSequence,userId]);
}
