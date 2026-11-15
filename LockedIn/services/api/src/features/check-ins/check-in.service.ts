import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { responseSchema } from "./check-in.schemas.js";
import type { NotificationTx } from "../notifications/index.js";

export async function saveCheckInResponse(sessionId: string, userId: string, data: z.infer<typeof responseSchema>, tx:NotificationTx = prisma) {
      await tx.intentionResponse.upsert({
        where: { sessionId_userId: { sessionId: sessionId, userId: userId } },
        update: {
          answers: data.answers,
          shareKeys: data.shareKeys,
          contextNotes: data.contextNotes,
          contextShareKeys: data.contextShareKeys,
          submittedAt: new Date(),
        },
        create: {
          sessionId: sessionId,
          userId: userId,
          answers: data.answers,
          shareKeys: data.shareKeys,
          contextNotes: data.contextNotes,
          contextShareKeys: data.contextShareKeys,
        },
      });

      const responseCount = await tx.intentionResponse.count({
        where: { sessionId: sessionId },
      });
      await tx.intentionSession.update({
        where: { id: sessionId },
        data: { status: responseCount === 2 ? "READY_TO_REVEAL" : "COLLECTING" },
      });
}

export async function revealCheckInResponse(responseId: string, sessionId: string, tx:NotificationTx = prisma) {
      await tx.intentionResponse.update({
        where: { id: responseId },
        data: { revealConsentedAt: new Date() },
      });

      const revealCount = await tx.intentionResponse.count({
        where: {
          sessionId: sessionId,
          revealConsentedAt: { not: null },
        },
      });
      await tx.intentionSession.update({
        where: { id: sessionId },
        data: { status: revealCount === 2 ? "REVEALED" : "READY_TO_REVEAL" },
      });
  return revealCount;
}
