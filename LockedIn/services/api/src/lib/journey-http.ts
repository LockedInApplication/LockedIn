import type { FastifyReply, FastifyRequest } from "fastify";
import { getAuthenticatedUser } from "./session.js";
import { env } from "../config/env.js";

export function emailVerificationRequired(user: { emailVerified: boolean }) {
  return env.REQUIRE_EMAIL_VERIFICATION === "true" && !user.emailVerified;
}

export function sendError(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ error: message });
}

export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    sendError(reply, 401, "Please sign in to continue.");
    return null;
  }
  if (emailVerificationRequired(user)) {
    reply.code(403).send({ error: "Verify your email before using LockedIn.", code: "EMAIL_NOT_VERIFIED" });
    return null;
  }

  return user;
}
