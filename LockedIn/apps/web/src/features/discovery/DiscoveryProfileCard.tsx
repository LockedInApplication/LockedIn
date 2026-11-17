"use client";

import { useState, type ReactNode } from "react";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import type { DiscoveryProfileInput } from "./discovery.types";
import { DiscoveryPhotoImage } from "./photos/DiscoveryPhotoGallery";
import common from "./discovery.module.scss";
import styles from "./discovery-profile-card.module.scss";
import { discoveryProfilePrompt } from "./discovery-prompt";

export default function DiscoveryProfileCard({ profile, area, photoIds = [], onReply, children }: {
  profile: DiscoveryProfileInput; area?: string; photoIds?: string[]; onReply?: () => void; children?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const photos = photoIds.slice(0, 3);
  const active = Math.min(index, Math.max(0, photos.length - 1));
  const id = photos[active];
  const avatar = <div className={styles.fallback}><ProfileAvatar name={profile.publicName} preset={profile.avatarPreset}/></div>;

  return <div className={styles.layout}>
    <div className={styles.visual}>
      <div className={id ? styles.frame : `${styles.frame} ${styles.avatarFrame}`}>
        {id ? <DiscoveryPhotoImage key={id} id={id} className={styles.photo} alt={`Photo ${active + 1} of ${profile.publicName}`} fallback={avatar}/> : avatar}
      </div>
      {photos.length > 1 ? <div className={styles.controls} role="group" aria-label="Profile photos">
        <button type="button" aria-label="Previous photo" disabled={active === 0} onClick={() => setIndex(active - 1)}>←</button>
        <span role="status">{active + 1} / {photos.length}</span>
        <button type="button" aria-label="Next photo" disabled={active === photos.length - 1} onClick={() => setIndex(active + 1)}>→</button>
      </div> : null}
    </div>
    <div className={styles.details}>
      <div><h2>{profile.publicName}</h2>{area ? <p className={common.muted}>{area}</p> : null}</div>
      <p className={styles.intention}>{profile.intention === "LONG_TERM" ? "Looking for a long-term relationship" : "Open to a long-term relationship"}</p>
      {profile.promptAnswer ? <section className={styles.prompt}>
        <h3>{discoveryProfilePrompt}</h3><p className={common.quote}>{profile.promptAnswer}</p>
        {onReply ? <button type="button" onClick={onReply}>Reply to this answer</button> : null}
      </section> : null}
      {profile.bio ? <div><h3>About me</h3><p className={common.quote}>{profile.bio}</p></div> : null}
      {profile.interests.length ? <div><h3>Interests</h3><ul className={styles.interests}>{profile.interests.map((interest, i) => <li key={i}>{interest}</li>)}</ul></div> : null}
      {profile.pace ? <div><h3>Communication pace</h3><p className={common.quote}>{profile.pace}</p></div> : null}
      {children}
    </div>
  </div>;
}
