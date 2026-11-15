type SuggestionNotification = {
  recipientId: string;
  kind: string;
  entityId: string;
  eventKey: string;
  resolvedAt: Date | null;
  suppressed: boolean;
};
type Choice = { id: string; userId: string; packKey: string | null };

/** Compare the persisted occurrence, not just the mutable choice row ID. */
export function suggestionMatches(
  notification: SuggestionNotification,
  userId: string,
  relationshipId: string,
  choice: Choice | null,
) {
  if (
    !choice ||
    choice.userId === userId ||
    notification.recipientId !== userId ||
    notification.kind !== "CONVERSATION_CHOICE" ||
    notification.entityId !== relationshipId ||
    notification.resolvedAt ||
    notification.suppressed
  )
    return false;
  const key = JSON.stringify([
    userId,
    "CONVERSATION_CHOICE",
    relationshipId,
    `${choice.id}:${choice.packKey ?? "either"}`,
  ]);
  return (
    notification.eventKey === key ||
    notification.eventKey.startsWith(`${key}::`)
  );
}
