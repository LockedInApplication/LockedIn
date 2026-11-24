"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import NotificationBell from "@/features/notifications/NotificationBell";
import { useNotifications } from "@/features/notifications/use-notifications";
import type { NotificationItem, UnreadChat } from "@/features/notifications/notification.types";
import { activeMemberTab } from "../member-navigation";
import styles from "../workspace-header.module.scss";
import WorkspaceHeader, { type WorkspaceHeaderProps } from "./WorkspaceHeader";

const InboxUnread = createContext<readonly UnreadChat[]>([]);
export const useInboxUnread = () => useContext(InboxUnread);

type Props = Pick<WorkspaceHeaderProps, "onNavigate" | "onSignOut" | "user"> & {
  userId: string;
  className?: string;
  invitationView?: boolean;
  onOpenNotification: (item: NotificationItem) => Promise<boolean>;
  onActivity: () => void;
  onExpired: () => void;
  onStatusChange?: (activity?: boolean) => void;
  onChatSync?: () => void;
  onRoomSync?: () => void;
  children: ReactNode;
};

export default function MemberChrome({ userId, user, className, invitationView, onNavigate, onSignOut, onOpenNotification, onActivity, onExpired, onStatusChange, onChatSync, onRoomSync, children }: Props) {
  const pathname = usePathname();
  const editorial = pathname === "/journey" || pathname === "/connections" || pathname === "/discover" || pathname === "/profile";
  const notifications = useNotifications(userId, onActivity, onExpired, onStatusChange, onChatSync, onRoomSync);
  return <div className={`${styles.frame} ${className ?? ""} ${editorial ? styles.editorial : ""}`}>
    <WorkspaceHeader user={user} active={activeMemberTab(pathname, invitationView)} editorial={editorial} onNavigate={onNavigate} onSignOut={onSignOut}
      unreadCount={notifications.unreadChatCount}
      notifications={<NotificationBell notifications={notifications} onOpen={onOpenNotification}/>}/>
    <InboxUnread.Provider value={notifications.unreadChats}>{children}</InboxUnread.Provider>
  </div>;
}
