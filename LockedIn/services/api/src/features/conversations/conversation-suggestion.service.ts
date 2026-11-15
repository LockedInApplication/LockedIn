import type { NotificationTx } from "../notifications/index.js";
import { conversationPacks } from "./conversation.catalog.js";
import { suggestionMatches } from "./conversation-suggestion.identity.js";

export async function resolveConversationSuggestion(
  tx: NotificationTx,
  userId: string,
  id: bigint,
) {
  const notification = await tx.notification.findFirst({
    where: {
      id,
      recipientId: userId,
      kind: "CONVERSATION_CHOICE",
      suppressed: false,
    },
  });
  if (
    !notification ||
    notification.recipientId !== userId ||
    notification.suppressed ||
    notification.kind !== "CONVERSATION_CHOICE" ||
    !notification.relationshipId
  )
    return null;
  const relationship = await tx.relationship.findUnique({
    where: { id: notification.relationshipId },
    include: {
      members: {
        include: { user: { select: { name: true, displayName: true } } },
      },
    },
  });
  if (!relationship || !relationship.members.some((m) => m.userId === userId))
    return null;
  if (relationship.status !== "ACTIVE")
    return { status: "unavailable" as const, reason: "ended" as const };
  if (notification.resolvedAt)
    return { status: "unavailable" as const, reason: "resolved" as const };
  const choice = await tx.conversationChoice.findFirst({
    where: { relationshipId: relationship.id, userId: { not: userId } },
  });
  if (!suggestionMatches(notification, userId, relationship.id, choice))
    return { status: "unavailable" as const, reason: "changed" as const };
  const pack =
    choice!.packKey === null
      ? null
      : conversationPacks.find((p) => p.key === choice!.packKey);
  if (pack === undefined)
    return { status: "unavailable" as const, reason: "changed" as const };
  const active = await tx.intentionSession.findFirst({
    where: { relationshipId: relationship.id, status: { not: "ARCHIVED" } },
    include: { responses: true },
    orderBy: { createdAt: "desc" },
  });
  const canStart =
    !active ||
    (active.responses.length === 2 &&
      active.responses.every((r) => Boolean(r.revealConsentedAt)));
  const partner = relationship.members.find((m) => m.userId !== userId);
  const preview = pack
    ? {
        key: pack.key,
        title: pack.title,
        description: pack.description,
        icon: pack.icon,
        accent: pack.accent,
        questionCount: pack.questions.length,
      }
    : null;
  return {
    status: "pending" as const,
    relationshipId: relationship.id,
    partnerName:
      partner?.user.displayName ?? partner?.user.name ?? "Your partner",
    pack: preview,
    canStart,
  };
}
