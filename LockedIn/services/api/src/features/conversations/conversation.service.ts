import { getConversationPack } from "./conversation.catalog.js";
import { inTransaction, type NotificationTx } from "../notifications/index.js";
import { resolveConversationSuggestion } from "./conversation-suggestion.service.js";

export async function chooseConversation(relationshipId: string, userId: string, packKey: string | null, transaction?: NotificationTx, notificationId?: bigint) {
  return inTransaction(transaction, async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Relationship" WHERE "id" = ${relationshipId} FOR UPDATE`;

        if (notificationId !== undefined) {
          const suggestion = await resolveConversationSuggestion(tx,userId,notificationId);
          if (!suggestion || suggestion.status !== "pending" || suggestion.relationshipId !== relationshipId ||
              !suggestion.canStart || (suggestion.pack?.key ?? null) !== packKey) {
            return {error:"This suggestion has changed. Review the latest conversation choices."};
          }
        }

        const activeSession = await tx.intentionSession.findFirst({
          where: { relationshipId, status: { not: "ARCHIVED" } },
          include: { responses: true },
          orderBy: { createdAt: "desc" },
        });
        const currentComplete =
          !activeSession ||
          (activeSession.responses.length === 2 &&
            activeSession.responses.every((response) => Boolean(response.revealConsentedAt)));
        if (!currentComplete) {
          return { error: "Finish the current check-in together before choosing another conversation." };
        }

        await tx.conversationChoice.upsert({
          where: { relationshipId_userId: { relationshipId, userId: userId } },
          update: { packKey: packKey },
          create: { relationshipId, userId: userId, packKey: packKey },
        });

        const choices = await tx.conversationChoice.findMany({
          where: { relationshipId },
          orderBy: { updatedAt: "asc" },
        });
        if (choices.length < 2) return { started: false };

        const first = choices[0]!;
        const second = choices[1]!;
        const selectedPackKey =
          first.packKey === null && second.packKey === null
            ? null
            : first.packKey === null
              ? second.packKey
              : second.packKey === null
                ? first.packKey
                : first.packKey === second.packKey
                  ? first.packKey
                  : null;

        if (!selectedPackKey) return { started: false };

        const selectedPack = getConversationPack(selectedPackKey);
        if (activeSession) {
          await tx.intentionSession.updateMany({
            where: { relationshipId, status: { not: "ARCHIVED" } },
            data: { status: "ARCHIVED" },
          });
        }

        const session = await tx.intentionSession.create({
          data: {
            relationshipId,
            createdById: userId,
            packKey: selectedPack.key,
            topic: selectedPack.title,
          },
        });
        await tx.conversationChoice.deleteMany({ where: { relationshipId } });

        return { started: true, sessionId: session.id };
      });
}
