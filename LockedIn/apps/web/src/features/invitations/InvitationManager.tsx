"use client";
import { useEffect, useRef } from "react";
import SentInvitations from "./SentInvitations";
import InvitationBlocks from "./InvitationBlocks";
import managementStyles from "./invitation-management.module.scss";
export default function InvitationManager({ revision, onClose }: {
    revision: number;
    onClose: () => void;
}) {
    const root = useRef<HTMLElement>(null);
    useEffect(() => { root.current?.focus(); }, []);
    return <section ref={root} tabIndex={-1} className={managementStyles.manager} aria-labelledby="invitation-manager-title">
    <header className={managementStyles.heading}><div><span className={managementStyles.kicker}>YOUR SPACE · YOUR CHOICE</span><h1 id="invitation-manager-title">Invitations & boundaries</h1></div><button type="button" onClick={onClose}>Back to my space</button></header>
    <SentInvitations revision={revision}/>
    <InvitationBlocks revision={revision}/>
  </section>;
}
