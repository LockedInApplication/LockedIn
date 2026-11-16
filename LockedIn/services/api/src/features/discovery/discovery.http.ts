import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config/env.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import type { DiscoveryContext } from "./discovery.types.js";

declare module "fastify" {
  interface FastifyContextConfig { discoveryValidation?: { body: z.ZodObject; params: z.ZodObject } }
}
const empty = z.strictObject({});
export async function requireDiscoveryIdentity(request: FastifyRequest, reply: FastifyReply): Promise<DiscoveryContext | null> {
  reply.header("Cache-Control", "private, no-store");
  const user = await requireUser(request, reply);
  if (!user) return null;
  const allowed = new Set(["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]);
  try { allowed.add(new URL(env.APP_URL).origin); } catch { /* No configured origin is trusted when invalid. */ }
  if (!request.headers.origin || !allowed.has(request.headers.origin)) {
    sendError(reply, 403, "This request must come from LockedIn."); return null;
  }
  if (request.headers["x-discovery-owner"] !== user.id) {
    sendError(reply, 409, "Your account changed. Reload before saving."); return null;
  }
  const schemas = request.routeOptions.config.discoveryValidation;
  if (!(schemas?.params ?? empty).strict().safeParse(request.params ?? {}).success || !empty.safeParse(request.query ?? {}).success) {
    sendError(reply, 400, "Please check your discovery request."); return null;
  }
  return { userId: user.id, emailVerified: user.emailVerified };
}
export async function requireDiscoveryMutation(request: FastifyRequest, reply: FastifyReply): Promise<DiscoveryContext | null> {
  const context = await requireDiscoveryIdentity(request, reply);
  if (!context) return null;
  const schema = request.routeOptions.config.discoveryValidation?.body ?? empty;
  if (!schema.strict().safeParse(request.body ?? {}).success) {
    sendError(reply, 400, "Please check your discovery request."); return null;
  }
  return context;
}
