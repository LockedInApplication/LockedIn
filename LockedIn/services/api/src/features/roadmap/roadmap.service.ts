import type { z } from "zod";
import { reflectionSchema } from "./roadmap.schemas.js";
import { inTransaction, type NotificationTx } from "../notifications/index.js";

export async function acceptRoadmapStep(stepId: string, sessionId: string, transaction?:NotificationTx) {
      await inTransaction(transaction,async tx=>{
        await tx.sharedNextStep.update({
          where: { id: stepId },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
        });
        await tx.intentionSession.update({
          where: { id: sessionId },
          data: { status: "ACTION_CHOSEN" },
        });
      });
}

export async function saveRoadmapReflection(stepId: string, sessionId: string, userId: string, data: z.infer<typeof reflectionSchema>, transaction?:NotificationTx) {
      return inTransaction(transaction,async tx=>{
      await tx.reflection.upsert({
        where: { nextStepId_userId: { nextStepId: stepId, userId: userId } },
        update: { outcome: data.outcome, note: data.note || null },
        create: {
          nextStepId: stepId,
          userId: userId,
          outcome: data.outcome,
          note: data.note || null,
        },
      });

      const reflections = await tx.reflection.findMany({ where: { nextStepId: stepId } });
      if (reflections.length === 2) {
        const finalStatus = reflections.every((item) => item.outcome === "COMPLETED")
          ? "COMPLETED"
          : reflections.some((item) => item.outcome === "CHANGED")
            ? "REVISED"
            : "PAUSED";

        const otherActiveSteps = await tx.sharedNextStep.count({
          where: {
            sessionId: sessionId,
            id: { not: stepId },
            status: "ACCEPTED",
          },
        });

        await tx.sharedNextStep.update({
            where: { id: stepId },
            data: { status: finalStatus },
          });
        await tx.intentionSession.update({
            where: { id: sessionId },
            data: { status: otherActiveSteps > 0 ? "ACTION_CHOSEN" : "REFLECTED" },
          });
      }
      });
}
