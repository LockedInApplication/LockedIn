"use client";
import Link from "next/link";
import BrandLogo from "@/components/brandLogo";
import type { ReactNode } from "react";
import styles from "@/app/journey/journey.module.scss";
import MobileAccountMenu from "./MobileAccountMenu";
import headerStyles from "../workspace-header.module.scss";
import { activeMemberTab, memberTabs } from "../member-navigation";

export type WorkspaceHeaderProps = {
  onSignOut: () => Promise<void>;
  onNavigate: (path: string) => unknown;
  active: ReturnType<typeof activeMemberTab>;
  notifications?: ReactNode;
  unreadCount?: number;
  user?: { name: string; avatarPreset?: string };
};

export default function WorkspaceHeader({ onSignOut, onNavigate, active, notifications, unreadCount = 0, user }: WorkspaceHeaderProps) {
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void onNavigate(path);
  };
  const badge = unreadCount > 99 ? "99+" : unreadCount;
  return (
    <header className={`${styles.header} ${headerStyles.header}`}>
      <Link href="/journey" className={styles.brand} aria-label="LockedIn · Together" onClick={event => navigate(event, "/journey")}>
        <span className={styles.brandMark}><BrandLogo /></span><span>LockedIn</span>
      </Link>
      <nav className={headerStyles.tabs} aria-label="Main navigation">
        {memberTabs.map(({ label, href, icon }) => {
          const count = label === "Inbox" && unreadCount > 0 ? badge : null;
          return <Link key={label} href={href} aria-current={active === label ? "page" : undefined}
            aria-label={count ? `Inbox, ${count} unread ${unreadCount === 1 ? "conversation" : "conversations"}` : undefined}
            onClick={event => navigate(event, href)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon}/></svg>
            <span>{label}</span>{count ? <span className={headerStyles.badge} aria-hidden="true">{count}</span> : null}
          </Link>;
        })}
      </nav>
      <div className={`${styles.headerActions} ${headerStyles.actions}`}>
        {notifications}
        <MobileAccountMenu user={user} onNavigate={onNavigate} onSignOut={onSignOut}/>
      </div>
    </header>
  );
}
