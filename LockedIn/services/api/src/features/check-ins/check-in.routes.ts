import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { isRelationshipMember } from "../relationships/relationship-access.service.js";
import { sendJourneyEmailSafely } from "../journey-notifications/journey-email.service.js";
import { getConversationPack } from "../conversations/conversation.catalog.js";
import { responseSchema } from "./check-in.schemas.js";
import { buildSessionView } from "./check-in.view.js";
import { saveCheckInResponse, revealCheckInResponse } from "./check-in.service.js";
import { withNotifications } from "../notifications/index.js";

export async function registerCheckInRoutes(server: FastifyInstance) {
  server.put<{ Params: { sessionId: string } }>(
    "/api/journey/sessions/:sessionId/responses",
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
        return sendError(reply, 409, "Earlier check-in chapters cannot be changed.");
      }

      const parsed = responseSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Complete each intention question.");

      const questions = getConversationPack(session.packKey).questions;
      const validKeys = new Set<string>(questions.map((question) => question.key));
      const complete = questions.every((question) => {
        const answer = parsed.data.answers[question.key];
        return question.options.some((option) => option.value === answer);
      });
      const shareKeysAreValid = parsed.data.shareKeys.every((key) => validKeys.has(key));
      const contextShareKeysAreValid = parsed.data.contextShareKeys.every((key) =>
        validKeys.has(key),
      );

      if (!complete || !shareKeysAreValid || !contextShareKeysAreValid) {
        return sendError(reply, 400, "Choose one valid answer for every question.");
      }

      const existing = await prisma.intentionResponse.findUnique({
        where: { sessionId_userId: { sessionId: session.id, userId: user.id } },
      });
      if (existing?.revealConsentedAt) {
        return sendError(reply, 409, "Answers cannot be changed after you consent to reveal them.");
      }

      await withNotifications(session.relationshipId, user.id, tx => saveCheckInResponse(session.id, user.id, parsed.data, tx));

      return buildSessionView(session.id, user.id);
    },
  );

  server.post<{ Params: { sessionId: string } }>(
    "/api/journey/sessions/:sessionId/reveal",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const response = await prisma.intentionResponse.findUnique({
        where: {
          sessionId_userId: { sessionId: request.params.sessionId, userId: user.id },
        },
        include: { session: true },
      });
      if (!response || !(await isRelationshipMember(response.session.relationshipId, user.id))) {
        return sendError(reply, 404, "Submit your intentions before revealing them.");
      }
      if (response.session.status === "ARCHIVED") {
        return sendError(reply, 409, "Earlier check-in chapters cannot be changed.");
      }

      const revealCount = await withNotifications(response.session.relationshipId, user.id, tx => revealCheckInResponse(response.id, request.params.sessionId, tx));

      if (revealCount === 2) {
        const partner = await prisma.relationshipMember.findFirst({
          where: {
            relationshipId: response.session.relationshipId,
            userId: { not: user.id },
          },
          include: { user: true },
        });
        if (partner?.user.email) {
          await sendJourneyEmailSafely(request, {
            to: partner.user.email,
            name: partner.user.name,
            subject: "Your LockedIn shared ground is ready",
            heading: "You both chose what to reveal.",
            message: "Your new shared-ground snapshot is ready. Private answers remain private.",
            actionLabel: "View shared ground",
            url: `${env.APP_URL}/journey`,
          });
        }
      }

      return buildSessionView(request.params.sessionId, user.id);
    },
  );

}
