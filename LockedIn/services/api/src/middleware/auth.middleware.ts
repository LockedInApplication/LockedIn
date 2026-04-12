import type { FastifyRequest, FastifyReply } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from "../lib/auth.js";

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;
type AuthenticatedRequest = FastifyRequest & {
  user?: NonNullable<Session>["user"];
};

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  // const session = await auth.api.getSession({
  //   headers: fromNodeHeaders(request.headers),
  // });

  // if (!session) {
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }

  // (request as AuthenticatedRequest).user = session.user;
}