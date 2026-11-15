import Link from "next/link";
import BrandLogo from "@/components/brandLogo";
import type { ReactNode } from "react";
import styles from "@/app/journey/journey.module.scss";

export default function WorkspaceHeader({ onSignOut, notifications }: { onSignOut: () => Promise<void>; notifications?:ReactNode }) {
  return (
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="LockedIn home">
          <span className={styles.brandMark}><BrandLogo /></span>
          <span>LockedIn</span>
        </Link>
        <div className={styles.headerActions}>
          {notifications}
          <span className={styles.privacyPill}>Private by default</span>
          <button className={styles.textButton} onClick={onSignOut}>Sign out</button>
        </div>
      </header>
  );
}
