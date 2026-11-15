"use client";
import { useEffect, useRef } from "react";
import SentInvitations from "./SentInvitations";
import { OwnedInvitationBlocks } from "./InvitationManagerContent";
import { useInvitationList } from "./use-invitation-list";
import type { OwnedInvitationBlock } from "./invitation-management.types";
import managementStyles from "./invitation-management.module.scss";
export default function InvitationManager({ revision, onClose }: {
    revision: number;
    onClose: () => void;
}) {
    const root = useRef<HTMLElement>(null);
    const blocks = useInvitationList<OwnedInvitationBlock>("/api/journey/invitation-blocks", revision);
    useEffect(() => { root.current?.focus(); }, []);
    return <section ref={root} tabIndex={-1} className={managementStyles.manager} aria-labelledby="invitation-manager-title">
    <header className={managementStyles.heading}><div><span className={managementStyles.kicker}>YOUR SPACE · YOUR CHOICE</span><h1 id="invitation-manager-title">Invitations & boundaries</h1></div><button type="button" onClick={onClose}>Back to my space</button></header>
    <SentInvitations revision={revision}/>
    <section className={managementStyles.section} aria-labelledby="own-invitation-blocks">
      <h2 id="own-invitation-blocks">People you’ve blocked from invitations</h2>
      <p className={managementStyles.note}>These settings are private to you. They only affect invitations, not any existing shared space.</p>
      {blocks.error ? <div role="alert"><p>{blocks.error}</p><button type="button" onClick={blocks.reload}>Try again</button></div> : null}
      {blocks.loading && !blocks.items.length ? <p role="status">Loading your settings…</p> : null}
      {!blocks.loading && !blocks.error && !blocks.items.length ? <p>No invitation blocks added.</p> : null}
      <OwnedInvitationBlocks items={blocks.items} busy={blocks.busy} onUnblock={id => {
            if (window.confirm("Remove your invitation block? This will not reconnect you or restore old invitations."))
                void blocks.mutate(`/api/journey/invitation-blocks/${encodeURIComponent(id)}`, "DELETE");
        }}/>
      {blocks.nextCursor ? <button type="button" disabled={blocks.loading || blocks.busy} onClick={blocks.more}>More settings</button> : null}
    </section>
  </section>;
}
