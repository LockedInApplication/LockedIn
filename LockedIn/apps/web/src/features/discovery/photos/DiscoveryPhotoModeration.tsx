"use client";
import { useCallback, useRef, useState } from "react";
import { useDiscovery } from "../DiscoveryShell";
import { discoveryRequest } from "../discovery.client";
import type { PageOf } from "../discovery.types";
import { useDiscoveryResource } from "../use-discovery-resource";
import { DiscoveryPhotoImage } from "./DiscoveryPhotoGallery";
import type { PhotoReview } from "./discovery-photo.types";
import common from "../discovery.module.scss";
import styles from "./discovery-photo.module.scss";

type Action = "APPROVE" | "REJECT" | "REMOVE";
export default function DiscoveryPhotoModeration() {
  const { userId, me, setBusy, busy } = useDiscovery();
  const [before, setBefore] = useState<string | null>(null), [open, setOpen] = useState("");
  const [reason, setReason] = useState(""), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const pending = useRef(false), attempts = useRef(new Map<string, string>());
  const load = useCallback((signal: AbortSignal) => discoveryRequest<PageOf<PhotoReview>>(userId, `/api/discovery/moderation/photos${before ? `?before=${encodeURIComponent(before)}` : ""}`, { signal }), [userId, before]);
  const resource = useDiscoveryResource(userId, me.canModerate ? `photos:${before ?? ""}` : "", load);
  if (!me.canModerate) return null;
  async function act(photo: PhotoReview, action: Action) {
    if (busy || pending.current || !reason.trim() || !window.confirm(`${action === "REMOVE" ? "Remove this photo from Discover" : `${action === "APPROVE" ? "Approve" : "Reject"} this photo`}? Your decision and reason will be recorded.`)) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const body = { action, reason: reason.trim(), decisionRevision: photo.decisionRevision };
      const key = `${photo.id}:${JSON.stringify(body)}`;
      const requestId = attempts.current.get(key) ?? crypto.randomUUID(); attempts.current.set(key, requestId);
      await discoveryRequest(userId, `/api/discovery/moderation/photos/${photo.id}/review`, { method: "POST", body: JSON.stringify({ ...body, requestId }) });
      setOpen(""); setReason(""); setNotice("Decision saved. Approval does not publish the photo."); resource.retry();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the review."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section aria-label="Photo review queue" className={`${common.card} ${styles.section}`}>
    <h2>Photo review queue</h2><p>Flagged photos, appeals, and reports. Open a preview only when you need to review it.</p>
    {error || resource.error ? <p role="alert">{error || resource.error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {!resource.value && !resource.error ? <p role="status">Loading photo reviews…</p> : null}
    {resource.value?.items.length === 0 ? <p>No photos to review.</p> : null}
    {resource.value?.items.map(photo => <article key={photo.id} className={styles.section}>
      <h3>{photo.appealed ? "Appeal" : photo.reported ? "Reported photo" : "Photo check"}</h3>
      <p>{photo.reason}{photo.removed ? " · Removed from Discover." : ""}</p>
      {photo.failedJobs.length ? <p role="status">Worker needs attention: {photo.failedJobs.join(", ")}.</p> : null}
      {open === photo.id ? <>
        {photo.canPreview ? <DiscoveryPhotoImage key={`${photo.id}:${photo.decisionRevision}`} id={photo.id} kind="review" className={styles.preview} alt="Restricted photo evidence" fallback={<p>Preview is unavailable.</p>}/> : <p>No preview is available for this record.</p>}
        {photo.canApprove || (!photo.removed && photo.reported) ? <label>Decision reason<textarea disabled={busy} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}/></label> : null}
        <div className={styles.actions}>
          {photo.canApprove ? <><button disabled={busy || !reason.trim()} onClick={() => void act(photo, "APPROVE")}>Approve</button><button disabled={busy || !reason.trim()} onClick={() => void act(photo, "REJECT")}>Reject</button></> : null}
          {!photo.removed && photo.reported ? <button disabled={busy || !reason.trim()} onClick={() => void act(photo, "REMOVE")}>Remove photo</button> : null}
          <button disabled={busy} onClick={() => { setOpen(""); setReason(""); }}>Close review</button>
        </div>
        <details><summary>Photo audit history</summary>{photo.audits.map((audit, index) => <p key={`${audit.createdAt}:${index}`}>{audit.action} · {audit.reason}</p>)}</details>
      </> : <button disabled={busy} onClick={() => { setOpen(photo.id); setReason(""); }}>{photo.canPreview ? "Open preview" : "Open record"}</button>}
    </article>)}
    <div className={styles.actions}>
      <button disabled={busy} onClick={() => { setOpen(""); resource.retry(); }}>Refresh queue</button>
      {before ? <button disabled={busy} onClick={() => { setOpen(""); setBefore(null); }}>Latest photos</button> : null}
      {resource.value?.nextCursor ? <button disabled={busy} onClick={() => { setOpen(""); setBefore(resource.value!.nextCursor); }}>Older photos</button> : null}
    </div>
  </section>;
}
