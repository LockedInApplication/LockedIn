import type { ConversationMetadata, DirectInboxChat } from "@/features/messaging/messaging.types";
import type { UnreadChat } from "@/features/notifications/notification.types";
import type { DiscoveryConnectionView } from "./discovery.types";
import { connectionStatus } from "./connection-status";

export function inboxEntries(connections: readonly DiscoveryConnectionView[], linked: ConversationMetadata | null, unread: readonly UnreadChat[], discoveryChatEnabled: boolean, direct: readonly DirectInboxChat[] = []) {
  const unreadLinks = unread.map(item => ({
    href: item.discoveryConnectionId ? `/connections/${item.discoveryConnectionId}` : `/messages/${item.conversationId}`,
    connectionId: item.discoveryConnectionId ?? (item.conversationId === linked?.id ? linked.opening?.connectionId : null),
    conversationId: item.conversationId,
  }));
  const reusedSources = new Set(direct.map(chat => chat.discoveryConnectionId));
  const rows = connections.filter(connection => !reusedSources.has(connection.id)).map(connection => {
    const open = discoveryChatEnabled && (connection.canChat ?? connection.state === "ACCEPTED");
    const href = open && connection.directConversationId ? `/messages/${encodeURIComponent(connection.directConversationId)}` : `/connections/${connection.id}`;
    return {
      href,
      partner: connection.partner,
      detail: connection.topic.text,
      status: !open && connection.state === "ACCEPTED" ? "Chat unavailable" : connectionStatus(connection).label,
      group: open ? "chat" : connection.state === "PENDING" ? "invitation" : "history",
      unread: open && unreadLinks.some(item => item.connectionId === connection.id || item.href === href),
    };
  });
  if (linked && (linked.canChat || linked.unavailableReason === "VERIFY_EMAIL") &&
    !rows.some(row => (row.href === `/connections/${linked.opening?.connectionId}` || row.href === `/messages/${linked.id}`) && row.group === "chat")) {
    rows.unshift({
      href: `/messages/${linked.id}`, partner: linked.partner, status: linked.canChat ? (linked.opening ? "Locked in" : "Shared space") : "Verify email to chat",
      detail: linked.opening ? linked.opening.questionText : "Your shared-space conversation", group: "chat",
      unread: unreadLinks.some(item => item.conversationId === linked.id),
    });
  }
  for (const chat of [...direct].reverse()) {
    rows.unshift({
      href: `/messages/${encodeURIComponent(chat.conversationId)}`, partner: chat.partner, status: "Chat",
      detail: "Started from a direct invite", group: "chat",
      unread: unreadLinks.some(item => item.conversationId === chat.conversationId),
    });
  }
  const chatRows = rows.filter(row => row.group === "chat").sort((a, b) => Number(b.unread) - Number(a.unread));
  return {
    chats: chatRows, invitations: rows.filter(row => row.group === "invitation"), history: rows.filter(row => row.group === "history"),
    offPageUnread: unreadLinks.find(item => !chatRows.some(row => row.href === item.href || (item.connectionId && row.href === `/connections/${item.connectionId}`)))?.href,
  };
}
