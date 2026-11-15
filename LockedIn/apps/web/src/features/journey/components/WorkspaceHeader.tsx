import Link from "next/link";
import BrandLogo from "@/components/brandLogo";
import styles from "@/app/journey/journey.module.scss";

export default function WorkspaceHeader({ onSignOut }: { onSignOut: () => Promise<void> }) {
  return (
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="LockedIn home">
          <span className={styles.brandMark}><BrandLogo /></span>
          <span>LockedIn</span>
        </Link>
        <div className={styles.headerActions}>
          <span className={styles.privacyPill}>Private by default</span>
          <button className={styles.textButton} onClick={onSignOut}>Sign out</button>
        </div>
      </header>
  );
}
