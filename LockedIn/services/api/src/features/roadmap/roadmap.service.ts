import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { reflectionSchema } from "./roadmap.schemas.js";

export async function acceptRoadmapStep(stepId: string, sessionId: string) {
      await prisma.$transaction([
        prisma.sharedNextStep.update({
          where: { id: stepId },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
        }),
        prisma.intentionSession.update({
          where: { id: sessionId },
          data: { status: "ACTION_CHOSEN" },
        }),
      ]);
}

export async function saveRoadmapReflection(stepId: string, sessionId: string, userId: string, data: z.infer<typeof reflectionSchema>) {
      await prisma.reflection.upsert({
        where: { nextStepId_userId: { nextStepId: stepId, userId: userId } },
        update: { outcome: data.outcome, note: data.note || null },
        create: {
          nextStepId: stepId,
          userId: userId,
          outcome: data.outcome,
          note: data.note || null,
        },
      });

      const reflections = await prisma.reflection.findMany({ where: { nextStepId: stepId } });
      if (reflections.length === 2) {
        const finalStatus = reflections.every((item) => item.outcome === "COMPLETED")
          ? "COMPLETED"
          : reflections.some((item) => item.outcome === "CHANGED")
            ? "REVISED"
            : "PAUSED";

        const otherActiveSteps = await prisma.sharedNextStep.count({
          where: {
            sessionId: sessionId,
            id: { not: stepId },
            status: "ACCEPTED",
          },
        });

        await prisma.$transaction([
          prisma.sharedNextStep.update({
            where: { id: stepId },
            data: { status: finalStatus },
          }),
          prisma.intentionSession.update({
            where: { id: sessionId },
            data: { status: otherActiveSteps > 0 ? "ACTION_CHOSEN" : "REFLECTED" },
          }),
        ]);
      }
}
