import type { ConversationMetadata } from "@/features/messaging/messaging.types";
import type { UnreadChat } from "@/features/notifications/notification.types";
import type { DiscoveryConnectionView } from "./discovery.types";
import { connectionStatus } from "./connection-status";

export function inboxEntries(connections: readonly DiscoveryConnectionView[], linked: ConversationMetadata | null, unread: readonly UnreadChat[], discoveryChatEnabled: boolean) {
  const unreadLinks = unread.map(item => ({
    href: item.discoveryConnectionId ? `/connections/${item.discoveryConnectionId}` : `/messages/${item.conversationId}`,
    connectionId: item.discoveryConnectionId ?? (item.conversationId === linked?.id ? linked.opening?.connectionId : null),
    conversationId: item.conversationId,
  }));
  const rows = connections.map(connection => {
    const open = discoveryChatEnabled && (connection.canChat ?? connection.state === "ACCEPTED");
    return {
      href: `/connections/${connection.id}`,
      partner: connection.partner,
      detail: connection.topic.text,
      status: !open && connection.state === "ACCEPTED" ? "Chat unavailable" : connectionStatus(connection).label,
      group: open ? "chat" : connection.state === "PENDING" ? "invitation" : "history",
      unread: open && unreadLinks.some(item => item.connectionId === connection.id),
    };
  });
  if (linked && (linked.canChat || linked.unavailableReason === "VERIFY_EMAIL") &&
    !rows.some(row => row.href === `/connections/${linked.opening?.connectionId}` && row.group === "chat")) {
    rows.unshift({
      href: `/messages/${linked.id}`, partner: linked.partner, status: linked.canChat ? (linked.opening ? "Locked in" : "Shared space") : "Verify email to chat",
      detail: linked.opening ? linked.opening.questionText : "Your shared-space conversation", group: "chat",
      unread: unreadLinks.some(item => item.conversationId === linked.id),
    });
  }
  const chatRows = rows.filter(row => row.group === "chat").sort((a, b) => Number(b.unread) - Number(a.unread));
  return {
    chats: chatRows, invitations: rows.filter(row => row.group === "invitation"), history: rows.filter(row => row.group === "history"),
    offPageUnread: unreadLinks.find(item => !chatRows.some(row => row.href === item.href || (item.connectionId && row.href === `/connections/${item.connectionId}`)))?.href,
  };
}
