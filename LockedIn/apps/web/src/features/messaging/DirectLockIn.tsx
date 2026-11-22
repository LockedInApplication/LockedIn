"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { messagingRequest } from "./messaging.client";
import type { DirectLockInState } from "./messaging.types";
import styles from "./direct-lock-in.module.scss";

type Choice = { action: "request" } | { action: "confirm" | "withdraw" | "pass"; requestId: string };

export default function DirectLockIn({ userId, conversationId, state, inTogether = false, onRefresh }: {
  userId: string; conversationId: string; state: DirectLockInState; inTogether?: boolean; onRefresh: () => void;
}) {
  const source = JSON.stringify(state);
  const [updated, setUpdated] = useState<{ source: string; state: DirectLockInState | null }>();
  const view = updated?.source === source ? updated.state : state;
  const [choice, setChoice] = useState<Choice | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  async function choose(input: Choice) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setChoice(null);
    setError("");
    try {
      const next = await messagingRequest<DirectLockInState | null>(userId, `/api/messaging/conversations/${encodeURIComponent(conversationId)}/lock-in`, {
        method: "POST", body: JSON.stringify(input),
      });
      setUpdated({ source, state: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your choice couldn’t be saved. Try again.");
    } finally {
      running.current = false;
      setBusy(false);
      onRefresh();
    }
  }

  if (!view || (inTogether && view.state === "locked")) return null;
  if (view.state === "locked") return <div className={styles.entry}>
    <p role="status">You both chose to lock in.</p><Link href="/journey">Open Together</Link>
  </div>;

  return <section className={styles.entry} aria-label="Lock In together">
    {view.state === "available" ? (
      <button disabled={busy} type="button" onClick={() => setChoice({ action: "request" })}>Ask to lock in</button>
    ) : view.state === "requested" ? <>
      <p role="status">Your invitation to lock in was sent. Nothing changes unless you both agree.</p>
      <button disabled={busy} type="button" onClick={() => void choose({ action: "withdraw", requestId: view.requestId })}>Withdraw request</button>
    </> : view.state === "received" ? <>
      <p role="status">You’ve been invited to lock in. You can keep chatting either way.</p>
      <div className={styles.actions}>
        <button disabled={busy} type="button" onClick={() => setChoice({ action: "confirm", requestId: view.requestId })}>Lock in together</button>
        <button disabled={busy} type="button" onClick={() => void choose({ action: "pass", requestId: view.requestId })}>Not now</button>
      </div>
    </> : null}
    {error ? <p role="alert">{error}</p> : null}
    <ConfirmDialog open={!!choice} title={choice?.action === "confirm" ? "Lock in together?" : "Ask to lock in?"}
      description={inTogether
        ? "If you both agree, Discovery pauses for both of you. You’ll keep this Together space, your history, and all existing chats."
        : "If you both agree, Together opens and Discovery pauses for both of you. Your plans and existing chats stay available."}
      confirmLabel={choice?.action === "confirm" ? "Yes, lock in" : "Send request"} cancelLabel="Go back"
      onCancel={() => setChoice(null)} onConfirm={() => { if (choice) void choose(choice); }}/>
  </section>;
}
