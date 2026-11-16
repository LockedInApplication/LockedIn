"use client";
import Link from "next/link";
import BrandLogo from "@/components/brandLogo";
import type { ReactNode } from "react";
import styles from "@/app/journey/journey.module.scss";
import invitationStyles from "@/features/invitations/invitation-management.module.scss";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import MobileAccountMenu from "./MobileAccountMenu";
import headerStyles from "../workspace-header.module.scss";
import discoveryStyles from "@/features/discovery/discovery.module.scss";

export type WorkspaceHeaderProps = {
  onSignOut: () => Promise<void>;
  notifications?: ReactNode;
  onInvitations?: () => void;
  onProfile?: () => void;
  onHome?: () => void;
  onExplore?: () => void;
  exploreLabel?: string;
  user?: { name: string; avatarPreset?: string };
};
export default function WorkspaceHeader({
  onSignOut,
  notifications,
  onInvitations,
  onProfile,
  onHome,
  onExplore,
  exploreLabel = "Explore people",
  user,
}: WorkspaceHeaderProps) {
  return (
    <header className={`${styles.header} ${headerStyles.header}`}>
      <Link href="/" className={styles.brand} aria-label="LockedIn home" onClick={event=>{if(onHome){event.preventDefault();onHome();}}}>
        <span className={styles.brandMark}>
          <BrandLogo />
        </span>
        <span>LockedIn</span>
      </Link>
      <div className={`${styles.headerActions} ${headerStyles.actions}`}>
        <div className={headerStyles.desktop}>
          {onExplore?<button type="button" className={discoveryStyles.explore} onClick={onExplore}>{exploreLabel}</button>:null}
          {onProfile ? (
            <button
              type="button"
              className={invitationStyles.headerButton}
              onClick={onProfile}
            >
              {user ? (
                <ProfileAvatar name={user.name} preset={user.avatarPreset} />
              ) : null}{" "}
              Profile &amp; settings
            </button>
          ) : null}
          {onInvitations ? (
            <button
              type="button"
              className={invitationStyles.headerButton}
              onClick={onInvitations}
            >
              Invitations
            </button>
          ) : null}
        </div>
        {notifications}
        <div className={headerStyles.desktop}>
          <span className={styles.privacyPill}>Private by default</span>
          <button
            type="button"
            className={styles.textButton}
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
        <MobileAccountMenu
          user={user}
          onProfile={onProfile}
          onExplore={onExplore}
          exploreLabel={exploreLabel}
          onInvitations={onInvitations}
          onSignOut={onSignOut}
        />
      </div>
    </header>
  );
}
