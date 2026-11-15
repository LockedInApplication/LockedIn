import Link from "next/link";
import BrandLogo from "@/components/brandLogo";
import type { ReactNode } from "react";
import styles from "@/app/journey/journey.module.scss";
import invitationStyles from "@/features/invitations/invitation-management.module.scss";

export default function WorkspaceHeader({ onSignOut, notifications,onInvitations }: { onSignOut: () => Promise<void>; notifications?:ReactNode;onInvitations?:()=>void }) {
  return (
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="LockedIn home">
          <span className={styles.brandMark}><BrandLogo /></span>
          <span>LockedIn</span>
        </Link>
        <div className={styles.headerActions}>
          {onInvitations?<button type="button" className={invitationStyles.headerButton} onClick={onInvitations}>Invitations</button>:null}
          {notifications}
          <span className={styles.privacyPill}>Private by default</span>
          <button className={styles.textButton} onClick={onSignOut}>Sign out</button>
        </div>
      </header>
  );
}
