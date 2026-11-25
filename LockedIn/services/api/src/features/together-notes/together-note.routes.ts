import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAccountMutationIdentity } from "../../lib/account-mutation-http.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { readTogetherNotes, shareTogetherNote, TogetherNotesUnavailable } from "./together-note.service.js";

const base = "/api/journey/relationships/:relationshipId/home-notes";
const paramsSchema = z.strictObject({ relationshipId: z.uuid() });
const maxLength = 280;
const noteInput = z.strictObject({ text: z.string().trim().min(1).max(maxLength).refine(text => !text.includes("\u0000")) });

function route(write: boolean, action: (relationshipId: string, actorId: string, request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("Cache-Control", "private, no-store");
    const actorId = write ? (await requireAccountMutationIdentity(request, reply, "x-together-owner"))?.userId
      : (await requireUser(request, reply))?.id;
    if (!actorId) return;
    if (!write && request.headers["x-together-owner"] !== actorId) {
      return sendError(reply, 409, "Your account changed. Reload Together before opening notes.");
    }
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, "Notes aren’t available in this space.");
    try {
      return await action(params.data.relationshipId, actorId, request, reply);
    } catch (error) {
      if (error instanceof TogetherNotesUnavailable) return sendError(reply, 404, error.message);
      throw error;
    }
  };
}

export async function registerTogetherNoteRoutes(server: FastifyInstance) {
  server.get(base, route(false, readTogetherNotes));
  server.put(base, { bodyLimit: 2048 }, route(true, async (relationshipId, actorId, request, reply) => {
    const input = noteInput.safeParse(request.body);
    if (!input.success) return sendError(reply, 400, `Write a note of up to ${maxLength} characters.`);
    return shareTogetherNote(relationshipId, actorId, input.data.text);
  }));
}
