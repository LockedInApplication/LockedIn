"use client";
import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { messagingRequest } from "./messaging.client";
import type { ChatMessage } from "./messaging.types";
import styles from "./chat.module.scss";

export default function MessageSafetyActions({ userId, conversationId, message, onBlocked }: { userId: string; conversationId: string; message?: ChatMessage; onBlocked: () => void }) {
  const [reason,setReason] = useState("OTHER"), [detail,setDetail] = useState(""), [blockAlso,setBlockAlso] = useState(false), [busy,setBusy] = useState(false), [notice,setNotice] = useState(""), [confirm,setConfirm] = useState<"block" | "close" | null>(null);
  const attempt = useRef<{ body: string; id: string } | null>(null);
  const base = `/api/messaging/conversations/${conversationId}`;
  async function action(kind: "block" | "close") {
    setConfirm(null); setBusy(true);
    try { await messagingRequest(userId,`${base}/${kind}`,{ method: "POST", body: "{}" }); onBlocked(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not update contact."); } finally { setBusy(false); }
  }
  async function report() {
    if (!message) return; setBusy(true);
    const body = JSON.stringify({ messageId: message.id, reason, detail, blockAlso });
    if (attempt.current?.body !== body) attempt.current = { body, id: crypto.randomUUID() };
    try { await messagingRequest(userId,`${base}/reports`,{ method: "POST", body: JSON.stringify({ ...JSON.parse(body), requestId: attempt.current.id }) }); setNotice("Report received for moderator review."); if (blockAlso) onBlocked(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not send report."); } finally { setBusy(false); }
  }
  return <div className={styles.safety}>
    {message ? <form className={styles.form} onSubmit={e => { e.preventDefault(); void report(); }}><h3>Report selected message</h3><p>{message.text.slice(0,240)}</p>
      <label>Reason<select disabled={busy} value={reason} onChange={e => setReason(e.target.value)}><option value="OTHER">Other</option><option value="HARASSMENT">Harassment</option><option value="IMPERSONATION">Impersonation</option><option value="SPAM">Spam</option></select></label>
      <label>Optional context<textarea disabled={busy} maxLength={1000} value={detail} onChange={e => setDetail(e.target.value)}/></label>
      <label><span><input type="checkbox" disabled={busy} checked={blockAlso} onChange={e => setBlockAlso(e.target.checked)}/> Also block contact</span></label><p>Only this message is included as evidence. Moderators can review reported content.</p><button disabled={busy} type="submit">Send report</button></form> : null}
    <button type="button" disabled={busy} onClick={() => setConfirm("block")}>Block contact</button>{!message ? <button type="button" disabled={busy} onClick={() => setConfirm("close")}>Close chat</button> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <ConfirmDialog open={confirm !== null} onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm) void action(confirm); }} title={confirm === "block" ? "Block this contact?" : "Close this chat?"} description="This stops chat, but does not end your shared relationship space or erase sent messages. Unblocking will not reopen this chat." confirmLabel={confirm === "block" ? "Block contact" : "Close chat"} cancelLabel="Keep chat"/>
  </div>;
}
