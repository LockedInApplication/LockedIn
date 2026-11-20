import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { isRelationshipMember } from "../relationships/relationship-access.service.js";
import { sendJourneyEmailSafely } from "../journey-notifications/journey-email.service.js";
import { nextStepSchema, reflectionSchema } from "./roadmap.schemas.js";
import { reflectionOpensAt } from "./roadmap.dates.js";
import { acceptRoadmapStep, saveRoadmapReflection } from "./roadmap.service.js";
import { withNotifications } from "../notifications/index.js";
import { registerSimplePlanRoutes } from "./simple-plan.routes.js";

export async function registerRoadmapRoutes(server: FastifyInstance) {
  registerSimplePlanRoutes(server);
  server.post<{ Params: { sessionId: string } }>(
    "/api/journey/sessions/:sessionId/next-steps",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const session = await prisma.intentionSession.findUnique({
        where: { id: request.params.sessionId },
      });
      if (!session || !(await isRelationshipMember(session.relationshipId, user.id))) {
        return sendError(reply, 404, "Intention session not found.");
      }
      if (session.status === "ARCHIVED") {
        return sendError(reply, 409, "Add new roadmap ideas from the current check-in.");
      }

      const revealCount = await prisma.intentionResponse.count({
        where: { sessionId: session.id, revealConsentedAt: { not: null } },
      });
      if (revealCount !== 2) {
        return sendError(reply, 409, "Both people must consent before choosing a shared next step.");
      }

      const parsed = nextStepSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Add a clear, specific next step.");

      const stepData={
        sessionId:session.id,proposedById:user.id,status:"PROPOSED" as const,
        title:parsed.data.title,details:parsed.data.details||null,
        targetDate:parsed.data.targetDate?new Date(`${parsed.data.targetDate}T12:00:00.000Z`):null,
      };
      const step = await withNotifications(session.relationshipId, user.id, async tx => {
        const existing=await tx.sharedNextStep.findFirst({where:stepData});
        if(existing)return existing;
        return tx.sharedNextStep.create({
        data: {
          sessionId: session.id,
          proposedById: user.id,
          title: parsed.data.title,
          details: parsed.data.details || null,
          targetDate: parsed.data.targetDate
            ? new Date(`${parsed.data.targetDate}T12:00:00.000Z`)
            : null,
        },
      });
      });

      const partner = await prisma.relationshipMember.findFirst({
        where: { relationshipId: session.relationshipId, userId: { not: user.id } },
        include: { user: true },
      });
      if (partner?.user.email) {
        await sendJourneyEmailSafely(request, {
          to: partner.user.email,
          name: partner.user.name,
          subject: "A new LockedIn roadmap idea is waiting",
          heading: "Your partner suggested a next step.",
          message: "Review it privately. It becomes shared only if you choose to accept it.",
          actionLabel: "Review the suggestion",
          url: `${env.APP_URL}/journey`,
        });
      }

      return reply.code(201).send({ id: step.id });
    },
  );

  server.post<{ Params: { stepId: string } }>(
    "/api/journey/next-steps/:stepId/accept",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const step = await prisma.sharedNextStep.findUnique({
        where: { id: request.params.stepId },
        include: { session: true },
      });
      if (!step || !(await isRelationshipMember(step.session.relationshipId, user.id))) {
        return sendError(reply, 404, "Next step not found.");
      }
      if (step.proposedById === user.id) {
        return sendError(reply, 400, "Your partner needs to accept this proposal.");
      }
      if (step.status !== "PROPOSED") {
        return sendError(reply, 409, "This proposal is no longer waiting for acceptance.");
      }

      await withNotifications(step.session.relationshipId, user.id, tx => acceptRoadmapStep(step.id, step.sessionId, tx));

      const proposer = await prisma.user.findUnique({ where: { id: step.proposedById } });
      if (proposer?.email) {
        await sendJourneyEmailSafely(request, {
          to: proposer.email,
          name: proposer.name,
          subject: "Your LockedIn next step was accepted",
          heading: "A new step was added to your shared roadmap.",
          message: `Your partner accepted “${step.title}”. Its revisit date and reflections remain private until the right time.`,
          actionLabel: "View your roadmap",
          url: `${env.APP_URL}/journey`,
        });
      }

      return { accepted: true };
    },
  );

  server.post<{ Params: { stepId: string } }>(
    "/api/journey/next-steps/:stepId/reflections",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const step = await prisma.sharedNextStep.findUnique({
        where: { id: request.params.stepId },
        include: { session: true },
      });
      if (!step || !(await isRelationshipMember(step.session.relationshipId, user.id))) {
        return sendError(reply, 404, "Next step not found.");
      }
      if (!["ACCEPTED", "COMPLETED", "PAUSED"].includes(step.status)) {
        return sendError(reply, 409, "Accept the shared next step before reflecting on it.");
      }

      const reflectionOpening = reflectionOpensAt(step.targetDate);
      if (reflectionOpening && reflectionOpening.getTime() > Date.now()) {
        return sendError(
          reply,
          409,
          `Reflection opens on ${reflectionOpening.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}.`,
        );
      }

      const parsed = reflectionSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Choose a reflection outcome.");

      await withNotifications(step.session.relationshipId, user.id, tx => saveRoadmapReflection(step.id, step.sessionId, user.id, parsed.data, tx));

      return { saved: true };
    },
  );

}
