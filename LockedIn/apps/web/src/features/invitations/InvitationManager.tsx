"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import SentInvitations from "./SentInvitations";
import managementStyles from "./invitation-management.module.scss";
export default function InvitationManager({ revision, onClose }: {
    revision: number;
    onClose: () => void;
}) {
    const root = useRef<HTMLElement>(null);
    useEffect(() => { root.current?.focus(); }, []);
    return <section ref={root} tabIndex={-1} className={managementStyles.manager} aria-labelledby="invitation-manager-title">
    <header className={managementStyles.heading}><h1 id="invitation-manager-title">Sent invitations</h1><button type="button" onClick={onClose}>← Inbox</button></header>
    <SentInvitations revision={revision}/>
    <p><Link href="/profile#profile-privacy">Manage invitation blocks in Profile</Link></p>
  </section>;
}
