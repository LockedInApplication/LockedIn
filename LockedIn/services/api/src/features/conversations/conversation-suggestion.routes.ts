import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { resolveConversationSuggestion } from "./conversation-suggestion.service.js";
import { performConversationChoice } from "./conversation-choice.action.js";

export async function registerConversationSuggestionRoutes(
  server: FastifyInstance,
) {
  for (const method of ["GET", "POST"] as const)
    server.route<{ Params: { notificationId: string } }>({
      method,
      url: "/api/journey/notifications/:notificationId/conversation-suggestion",
      async handler(request, reply) {
        reply.header("Cache-Control", "private, no-store");
        const user = await requireUser(request, reply);
        if (!user) return;
        const raw = request.params.notificationId;
        if (!/^[1-9]\d{0,18}$/.test(raw) || BigInt(raw) > 9223372036854775807n)
          return sendError(reply, 400, "Invalid notification ID.");
        const id = BigInt(raw);
        const suggestion = await resolveConversationSuggestion(
          prisma,
          user.id,
          id,
        );
        if (!suggestion) return sendError(reply, 404, "Suggestion not found.");
        if (method === "GET") return suggestion;
        if (suggestion.status !== "pending" || !suggestion.canStart)
          return sendError(
            reply,
            409,
            "This suggestion is no longer available.",
          );
        const result = await performConversationChoice(
          request,
          user,
          suggestion.relationshipId,
          suggestion.pack?.key ?? null,
          id,
        );
      if ("error" in result)
        return sendError(reply, 409, result.error??'This suggestion is no longer available.');
        return reply.code(result.started ? 201 : 200).send(result);
      },
    });
}
