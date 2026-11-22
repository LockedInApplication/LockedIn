import type { FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";
import { accountDeletionInProgress } from "../features/profile/account-deletion.state.js";

export async function getAuthenticatedUser(request: FastifyRequest) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });

  return session?.user && !await accountDeletionInProgress(session.user.id) ? session.user : null;
}
