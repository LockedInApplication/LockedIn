"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import SentInvitations from "./SentInvitations";
import styles from "./sent-invitations.module.scss";
export default function InvitationManager({ revision, onClose }: {
    revision: number;
    onClose: () => void;
}) {
    const root = useRef<HTMLElement>(null);
    useEffect(() => { root.current?.focus(); }, []);
    return <section ref={root} tabIndex={-1} className={styles.manager} aria-labelledby="invitation-manager-title">
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Inbox</p><h1 id="invitation-manager-title">Sent invitations</h1></div>
      <button className={styles.pill} type="button" onClick={onClose}><span aria-hidden="true">←</span> Inbox</button>
    </header>
    <SentInvitations revision={revision}/>
    <footer className={styles.footer}><Link href="/profile#profile-privacy">Manage invitation blocks</Link></footer>
  </section>;
}
