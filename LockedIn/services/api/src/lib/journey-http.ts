import type { FastifyReply, FastifyRequest } from "fastify";
import { getAuthenticatedUser } from "./session.js";

export function sendError(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ error: message });
}

export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    sendError(reply, 401, "Please sign in to continue.");
    return null;
  }

  return user;
}
