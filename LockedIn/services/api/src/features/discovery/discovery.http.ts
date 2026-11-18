import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { sendError } from "../../lib/journey-http.js";
import { requireAccountMutationIdentity } from "../../lib/account-mutation-http.js";
import type { DiscoveryContext } from "./discovery.types.js";

declare module "fastify" {
  interface FastifyContextConfig { discoveryValidation?: { body: z.ZodObject; params: z.ZodObject } }
}
const empty = z.strictObject({});
export async function requireDiscoveryIdentity(request: FastifyRequest, reply: FastifyReply): Promise<DiscoveryContext | null> {
  const actor = await requireAccountMutationIdentity(request, reply, "x-discovery-owner");
  if (!actor) return null;
  const schemas = request.routeOptions.config.discoveryValidation;
  if (!(schemas?.params ?? empty).strict().safeParse(request.params ?? {}).success || !empty.safeParse(request.query ?? {}).success) {
    sendError(reply, 400, "Please check your discovery request."); return null;
  }
  return actor;
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
