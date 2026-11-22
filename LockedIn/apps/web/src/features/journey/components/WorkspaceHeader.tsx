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
  editorial?: boolean;
};

export default function WorkspaceHeader({ onSignOut, onNavigate, active, notifications, unreadCount = 0, user, editorial = false }: WorkspaceHeaderProps) {
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void onNavigate(path);
  };
  const badge = unreadCount > 99 ? "99+" : unreadCount;
  return (
    <header className={`${styles.header} ${headerStyles.header}`}>
      <Link href="/journey" className={styles.brand} aria-label="LockedIn · Together" onClick={event => navigate(event, "/journey")}>
        {editorial ? <><span className={headerStyles.rings} aria-hidden="true" /><span>Locked<em>In</em></span></>
          : <><span className={styles.brandMark}><BrandLogo /></span><span>LockedIn</span></>}
      </Link>
      <nav className={headerStyles.tabs} aria-label="Main navigation">
        {memberTabs.map(({ label, href, icon }) => {
          const count = label === "Inbox" && unreadCount > 0 ? badge : null;
          return <Link key={label} href={href} aria-current={active === label ? "page" : undefined}
            aria-label={count ? `Inbox, ${count} unread ${unreadCount === 1 ? "conversation" : "conversations"}` : undefined}
            onClick={event => navigate(event, href)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {editorial && label === "Together" ? <><circle cx="9" cy="12" r="5.5" /><circle cx="15" cy="12" r="5.5" /></>
                : <path d={editorial && label === "Inbox" ? "M4.5 6.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5ZM3.5 8 12 14l8.5-6" : icon}/>}
            </svg>
            <span>{label}</span>{count ? <span className={headerStyles.badge} aria-hidden="true">{count}</span> : null}
          </Link>;
        })}
      </nav>
      <div className={`${styles.headerActions} ${headerStyles.actions}`}>
        {editorial ? <Link className={headerStyles.backToSite} href="/" onClick={event => navigate(event, "/")}>Back to site</Link> : null}
        {notifications}
        <MobileAccountMenu user={user} onNavigate={onNavigate} onSignOut={onSignOut}/>
      </div>
    </header>
  );
}
