import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireUser, sendError } from "./journey-http.js";

export async function requireAccountMutationIdentity(request: FastifyRequest, reply: FastifyReply, ownerHeader: string) {
  reply.header("Cache-Control", "private, no-store");
  const user = await requireUser(request, reply); if (!user) return null;
  const allowed = new Set(["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]);
  try { allowed.add(new URL(env.APP_URL).origin); } catch { /* Invalid config trusts no extra origin. */ }
  if (!request.headers.origin || !allowed.has(request.headers.origin)) { sendError(reply, 403, "This request must come from LockedIn."); return null; }
  if (request.headers[ownerHeader] !== user.id) { sendError(reply, 409, "Your account changed. Reload before saving."); return null; }
  return { userId: user.id, emailVerified: user.emailVerified };
}

export const chatParams = z.strictObject({ id: z.string().uuid() });
export const emptyChatInput = z.strictObject({});
export const chatMessageInput = z.strictObject({ text: z.string().trim().min(1).max(2000).refine(v => !v.includes("\u0000")), requestId: z.string().uuid() });
export const chatQuery = z.strictObject({ before: z.string().regex(/^[1-9][0-9]{0,18}$/).refine(v => v.length < 19 || v <= "9223372036854775807").optional() });
