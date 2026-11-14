import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { getAuthenticatedUser } from "../../lib/session.js";
import { isRelationshipMember } from "../relationships/relationship-access.service.js";
import { atlasWords } from "./atlas.catalog.js";
import {
  heardConfirmationSchema,
  heardSummarySchema,
  meaningApprovalSchema,
  meaningResolutionSchema,
  meaningResponseSchema,
  meaningSelectionSchema,
  sharedDefinitionSchema,
} from "./atlas.schemas.js";
import {
  saveFinalApproval,
  saveMeaningSelection,
  savePersonalDefinitionProposal,
  saveResolvedDefinition,
} from "./atlas.service.js";

function sendError(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ error: message });
}

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    sendError(reply, 401, "Please sign in to continue.");
    return null;
  }

  return user;
}

export async function registerAtlasRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Params: { relationshipId: string; wordKey: string } }>(
    "/api/journey/relationships/:relationshipId/atlas/:wordKey",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      const { relationshipId, wordKey } = request.params;
      if (!(await isRelationshipMember(relationshipId, user.id))) {
        return sendError(reply, 403, "You do not have access to this relationship space.");
      }
      if (!atlasWords.some((word) => word.key === wordKey)) {
        return sendError(reply, 404, "That meaning landmark is not available.");
      }

      const active = await prisma.meaningChapter.findFirst({
        where: { relationshipId, wordKey, status: { not: "SHARED" } },
        orderBy: { createdAt: "desc" },
      });
      if (active) return { chapterId: active.id, existing: true };

      const chapter = await prisma.meaningChapter.create({
        data: { relationshipId, wordKey, createdById: user.id },
      });
      return reply.code(201).send({ chapterId: chapter.id, existing: false });
    },
  );

  server.put<{ Params: { chapterId: string } }>(
    "/api/journey/atlas/:chapterId/response",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      const parsed = meaningResponseSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Complete all three private meaning prompts.");

      const chapter = await prisma.meaningChapter.findUnique({
        where: { id: request.params.chapterId },
        include: { responses: true },
      });
      if (!chapter || !(await isRelationshipMember(chapter.relationshipId, user.id))) {
        return sendError(reply, 404, "Meaning chapter not found.");
      }
      if (["PROPOSING", "CHOOSING", "RESOLVING", "PROPOSED", "SHARED"].includes(chapter.status)) {
        return sendError(reply, 409, "This meaning chapter can no longer be edited.");
      }

      await prisma.meaningResponse.upsert({
        where: { chapterId_userId: { chapterId: chapter.id, userId: user.id } },
        update: { ...parsed.data, heardSummary: null, heardStatus: null },
        create: { chapterId: chapter.id, userId: user.id, ...parsed.data },
      });

      const responseCount = await prisma.meaningResponse.count({ where: { chapterId: chapter.id } });
      await prisma.meaningChapter.update({
        where: { id: chapter.id },
        data: { status: responseCount === 2 ? "DISCOVERING" : "COLLECTING" },
      });
      return { saved: true, bothReady: responseCount === 2 };
    },
  );

  server.put<{ Params: { chapterId: string } }>(
    "/api/journey/atlas/:chapterId/heard",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      const parsed = heardSummarySchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Describe what you heard in your own words.");

      const chapter = await prisma.meaningChapter.findUnique({
        where: { id: request.params.chapterId },
        include: { responses: true },
      });
      if (!chapter || !(await isRelationshipMember(chapter.relationshipId, user.id))) {
        return sendError(reply, 404, "Meaning chapter not found.");
      }
      if (["PROPOSING", "CHOOSING", "RESOLVING", "PROPOSED", "SHARED"].includes(chapter.status)) {
        return sendError(reply, 409, "The understanding check is already complete for this chapter.");
      }
      if (chapter.responses.length !== 2) {
        return sendError(reply, 409, "Both private meanings must be ready first.");
      }

      await prisma.meaningResponse.update({
        where: { chapterId_userId: { chapterId: chapter.id, userId: user.id } },
        data: { heardSummary: parsed.data.summary, heardStatus: "PENDING" },
      });
      await prisma.meaningChapter.update({ where: { id: chapter.id }, data: { status: "CHECKING" } });
      return { saved: true };
    },
  );

  server.post<{ Params: { chapterId: string; responseId: string } }>(
    "/api/journey/atlas/:chapterId/heard/:responseId/confirm",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      const parsed = heardConfirmationSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Choose how accurately you felt understood.");

      const chapter = await prisma.meaningChapter.findUnique({
        where: { id: request.params.chapterId },
        include: { responses: true },
      });
      if (!chapter || !(await isRelationshipMember(chapter.relationshipId, user.id))) {
        return sendError(reply, 404, "Meaning chapter not found.");
      }
      if (["PROPOSING", "CHOOSING", "RESOLVING", "PROPOSED", "SHARED"].includes(chapter.status)) {
        return sendError(reply, 409, "The understanding check is already complete for this chapter.");
      }
      const listenerResponse = chapter.responses.find((response) => response.id === request.params.responseId);
      const ownResponse = chapter.responses.find((response) => response.userId === user.id);
      if (!listenerResponse || listenerResponse.userId === user.id || !ownResponse) {
        return sendError(reply, 403, "Only the person being understood can confirm this summary.");
      }
      if (!listenerResponse.heardSummary) {
        return sendError(reply, 409, "Your partner has not submitted what they heard yet.");
      }

      await prisma.meaningResponse.update({
        where: { id: listenerResponse.id },
        data: { heardStatus: parsed.data.status },
      });
      return { saved: true };
    },
  );

  server.put<{ Params: { chapterId: string } }>(
    "/api/journey/atlas/:chapterId/shared-definition",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      const parsed = sharedDefinitionSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Write a shared definition in your own words.");

      const chapter = await prisma.meaningChapter.findUnique({
        where: { id: request.params.chapterId },
        include: { responses: true, selections: true },
      });
      if (!chapter || !(await isRelationshipMember(chapter.relationshipId, user.id))) {
        return sendError(reply, 404, "Meaning chapter not found.");
      }
      if (
        chapter.responses.length !== 2 ||
        chapter.responses.some((response) => response.heardStatus !== "CONFIRMED")
      ) {
        return sendError(reply, 409, "Confirm that both people feel understood before defining shared ground.");
      }
      if (chapter.status === "SHARED" || chapter.selections.length > 0) {
        return sendError(reply, 409, "The definition choice has already begun.");
      }

      const result = await savePersonalDefinitionProposal({
        chapterId: chapter.id,
        userId: user.id,
        definition: parsed.data.definition,
      });
      if (result.conflict) return sendError(reply, 409, "The definition choice has already begun.");
      return { saved: true, bothProposed: result.count >= 2 };
    },
  );

  server.post<{ Params: { chapterId: string } }>(
    "/api/journey/atlas/:chapterId/shared-definition/select",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      const parsed = meaningSelectionSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Choose a valid way forward.");

      const chapter = await prisma.meaningChapter.findUnique({
        where: { id: request.params.chapterId },
        include: { proposals: true },
      });
      if (!chapter || !(await isRelationshipMember(chapter.relationshipId, user.id))) {
        return sendError(reply, 404, "Meaning chapter not found.");
      }
      const personalProposals = chapter.proposals.filter((proposal) => proposal.kind === "PERSONAL");
      if (personalProposals.length !== 2 || !["CHOOSING"].includes(chapter.status)) {
        return sendError(reply, 409, "Both personal proposals must be ready before choosing.");
      }
      if (parsed.data.mode === "PROPOSAL") {
        if (!parsed.data.proposalId || !personalProposals.some((proposal) => proposal.id === parsed.data.proposalId)) {
          return sendError(reply, 400, "Choose one of the two preserved proposals.");
        }
      } else if (parsed.data.proposalId) {
        return sendError(reply, 400, "This choice does not use a proposal ID.");
      }

      const result = await saveMeaningSelection({
        chapterId: chapter.id,
        userId: user.id,
        mode: parsed.data.mode,
        proposalId: parsed.data.proposalId ?? null,
      });
      if (result.conflict) return sendError(reply, 409, "Your partner moved this choice forward. Refresh and continue together.");
      return { saved: true, resolved: result.resolved };
    },
  );

  server.put<{ Params: { chapterId: string } }>(
    "/api/journey/atlas/:chapterId/shared-definition/resolve",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      const parsed = meaningResolutionSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Write a complete blended or paired definition.");

      const chapter = await prisma.meaningChapter.findUnique({ where: { id: request.params.chapterId } });
      if (!chapter || !(await isRelationshipMember(chapter.relationshipId, user.id))) {
        return sendError(reply, 404, "Meaning chapter not found.");
      }

      const result = await saveResolvedDefinition({
        chapterId: chapter.id,
        userId: user.id,
        definition: parsed.data.definition,
        kind: parsed.data.kind,
        expectedVersion: parsed.data.expectedVersion,
      });
      if (result.conflict) return sendError(reply, 409, "A newer shared draft is ready. Refresh before editing it.");
      return { saved: true };
    },
  );

  server.post<{ Params: { chapterId: string } }>(
    "/api/journey/atlas/:chapterId/shared-definition/approve",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      const parsed = meaningApprovalSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Approve the current shared draft.");

      const chapter = await prisma.meaningChapter.findUnique({ where: { id: request.params.chapterId } });
      if (!chapter || !(await isRelationshipMember(chapter.relationshipId, user.id))) {
        return sendError(reply, 404, "Meaning chapter not found.");
      }

      const result = await saveFinalApproval({
        chapterId: chapter.id,
        userId: user.id,
        candidateVersion: parsed.data.candidateVersion,
      });
      if (result.conflict) return sendError(reply, 409, "A newer shared draft is ready. Review it before approving.");
      return { approved: true, complete: result.complete };
    },
  );
}
