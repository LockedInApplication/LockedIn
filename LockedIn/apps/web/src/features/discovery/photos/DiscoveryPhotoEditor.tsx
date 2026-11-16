"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDiscovery } from "../DiscoveryShell";
import { discoveryRequest } from "../discovery.client";
import { useDiscoveryResource } from "../use-discovery-resource";
import type { OwnDiscoveryProfile } from "../discovery.types";
import { DiscoveryPhotoImage } from "./DiscoveryPhotoGallery";
import type { OwnPhoto, OwnPhotos } from "./discovery-photo.types";
import common from "../discovery.module.scss";
import styles from "./discovery-photo.module.scss";

type Selection = { file: File; requestId: string; replacePhotoId?: string };
const accepted = ["image/jpeg", "image/png", "image/webp"];
export default function DiscoveryPhotoEditor({ profile, install }: { profile: OwnDiscoveryProfile; install: (value: OwnDiscoveryProfile) => void }) {
  const { userId, me, dirty, busy, setBusy } = useDiscovery();
  const [selection, select] = useState<Selection | null>(null), [replacement, setReplacement] = useState("");
  const [note, setNote] = useState(""), [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null), preview = useRef<HTMLImageElement>(null), running = useRef(false);
  const requests = useRef(new Map<string, string>());
  const enabled = me.canDiscover && !!me.photos?.enabled && !!me.photos.configured;
  const visible = enabled || !!profile.draft?.photoIds?.length || !!profile.published?.photoIds?.length;
  const load = useCallback((signal: AbortSignal) => discoveryRequest<OwnPhotos>(userId, "/api/discovery/photos", { signal }), [userId]);
  const resource = useDiscoveryResource(userId, visible ? `photos:${profile.revision}:${profile.publicationVersion}` : "", load);
  useEffect(() => {
    const image = preview.current;
    if (!selection || !image) return;
    const src = URL.createObjectURL(selection.file);
    image.src = src;
    return () => { image.removeAttribute("src"); URL.revokeObjectURL(src); };
  }, [selection, visible, enabled]);
  if (!visible) return null;
  const order = profile.draft?.photoIds ?? [], rows = resource.value?.items ?? [];
  const requestId = (key: string) => { const value = requests.current.get(key) ?? crypto.randomUUID(); requests.current.set(key, value); return value; };
  const run = async (work: () => Promise<void>, message: string) => {
    if (running.current || busy || dirty) return;
    running.current = true; setBusy(true); setNote(""); setError("");
    try { await work(); resource.retry(); setNote(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the photo."); }
    finally { running.current = false; setBusy(false); }
  };
  const reorder = (ids: string[]) => run(async () => {
    if (!profile.draft) return;
    install(await discoveryRequest<OwnDiscoveryProfile>(userId, "/api/discovery/profile", { method: "PUT", body: JSON.stringify({ ...profile.draft, photoIds: ids, revision: profile.revision }) }));
  }, "Private photo order saved. Publish to update Discover.");
  const move = (index: number, next: number) => { const ids = [...order]; [ids[index], ids[next]] = [ids[next]!, ids[index]!]; void reorder(ids); };
  const control = (photo: OwnPhoto, action: "appeal" | "retry" | "delete") => {
    const revision = action === "delete" ? { draftRevision: profile.revision } : { decisionRevision: photo.decisionRevision };
    if (action === "delete" && !window.confirm("Delete this photo from your draft and Discover now? If it was reported, restricted evidence may be retained.")) return;
    const base = `/api/discovery/photos/${photo.id}`;
    const body = JSON.stringify({ ...revision, requestId: requestId(`${photo.id}:${action}:${JSON.stringify(revision)}`) });
    return run(async () => {
      if (action === "delete") install(await discoveryRequest<OwnDiscoveryProfile>(userId, base, { method: "DELETE", body }));
      else await discoveryRequest(userId, `${base}/${action}`, { method: "POST", body });
    }, action === "delete" ? "Photo removed from Discover and your draft." : action === "appeal" ? "Appeal sent for review." : "Photo check requested.");
  };
  return <section className={`${common.card} ${styles.section}`} aria-label="Discovery photos">
    <h2 id="discovery-photos-heading" tabIndex={-1}>Discovery photos</h2>
    <p>Optional · up to 3. Your avatar is shown if you don’t publish a photo.</p>
    {enabled ? <p>JPEG, PNG or WebP · up to 5 MiB. HEIC and animated images aren’t supported. Cloudinary screens uploads before you can publish them.</p> : null}
    {dirty ? <p role="status">Save your text edits before changing photos.</p> : null}
    {!profile.draft && enabled ? <p>Save a private draft first to add photos.</p> : null}
    {enabled && profile.draft ? <>
      {order.length ? <label>Photo slot <select value={replacement} disabled={busy || dirty} onChange={event => { setReplacement(event.target.value); select(null); if (input.current) input.current.value = ""; }}><option value="">Add a new photo</option>{order.map((id, index) => <option key={id} value={id}>Replace photo {index + 1}</option>)}</select></label> : null}
      <label>Choose photo <input ref={input} type="file" accept={accepted.join(",")} disabled={busy || dirty || (order.length >= 3 && !replacement)} onChange={event => {
        const file = event.target.files?.[0]; setError("");
        if (!file) { select(null); return; }
        if (!accepted.includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Choose a still JPEG, PNG or WebP up to 5 MiB."); select(null); return; }
        select({ file, requestId: crypto.randomUUID(), ...(replacement ? { replacePhotoId: replacement } : {}) });
      }}/></label>
      {selection ? <div className={styles.actions}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={preview} alt="Selected photo, not uploaded" className={styles.thumbnail}/>
        <button type="button" disabled={busy || dirty} onClick={() => void run(async () => {
          const body = new FormData(); body.append("requestId", selection.requestId); body.append("draftRevision", String(profile.revision)); body.append("file", selection.file);
          if (selection.replacePhotoId) body.append("replacePhotoId", selection.replacePhotoId);
          const value = await discoveryRequest<{ photoId: string; profile: OwnDiscoveryProfile }>(userId, "/api/discovery/photos", { method: "POST", body });
          install(value.profile); select(null); setReplacement(""); if (input.current) input.current.value = "";
        }, "Photo saved privately. Review its status before publishing.")}>{selection.replacePhotoId ? "Upload replacement" : "Upload photo"}</button>
        <button type="button" disabled={busy} onClick={() => { select(null); if (input.current) input.current.value = ""; }}>Clear selection</button>
      </div> : null}
    </> : null}
    {rows.length ? <ul className={styles.photos}>{rows.map(photo => {
      const index = order.indexOf(photo.id);
      return <li key={photo.id}>
        <strong>{index === 0 ? "Main photo" : index > 0 ? `Photo ${index + 1}` : "Only in your published profile"}</strong>
        {photo.src && photo.state !== "REJECTED" ? <DiscoveryPhotoImage id={photo.id} className={styles.photo} alt="Your Discovery photo"/> : null}
        <p>{photo.reason}</p>
        {index >= 0 && me.canDiscover ? <div className={styles.actions}>
          {enabled ? <><button type="button" disabled={busy || dirty || index === 0} onClick={() => move(index, index - 1)}>Move earlier</button>
          <button type="button" disabled={busy || dirty || index === order.length - 1} onClick={() => move(index, index + 1)}>Move later</button></> : null}
          <button type="button" disabled={busy || dirty} onClick={() => void reorder(order.filter(id => id !== photo.id))}>Remove from draft</button>
        </div> : null}
        <div className={styles.actions}>
          {photo.canAppeal ? <button type="button" disabled={busy || dirty} onClick={() => void control(photo, "appeal")}>Appeal</button> : null}
          {enabled && photo.state === "CHECK_FAILED" ? <button type="button" disabled={busy || dirty} onClick={() => void control(photo, "retry")}>Retry check</button> : null}
          <button type="button" disabled={busy || dirty} onClick={() => void control(photo, "delete")}>Delete now</button>
        </div>
      </li>;
    })}</ul> : null}
    {rows.length ? <p>Replacing or removing from the draft leaves a published photo unchanged until you publish. Delete removes it immediately.</p> : null}
    {note ? <p role="status">{note}</p> : null}{error || resource.error ? <p role="alert">{error || resource.error}</p> : null}
    <button type="button" disabled={busy} onClick={resource.retry}>Refresh photo status</button>
  </section>;
}
