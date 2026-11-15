import type { FastifyInstance } from "fastify";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { env } from "../../config/env.js";
import { getProfile, updateProfile } from "./profile.service.js";
import {
  profileDetailsSchema,
  profileNotificationsSchema,
} from "./profile.schemas.js";
import { ensureInvitationNotifications } from "../invitations/invitation-notifications.service.js";
export async function registerProfileRoutes(server: FastifyInstance) {
  server.get("/api/profile", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply);
    if (user) return getProfile(user.id);
  });
  for (const [path, schema] of [
    ["details", profileDetailsSchema],
    ["notifications", profileNotificationsSchema],
  ] as const) {
    server.put(`/api/profile/${path}`, async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      const user = await requireUser(request, reply);
      if (!user) return;
      if (
        request.headers["x-profile-owner"] &&
        request.headers["x-profile-owner"] !== user.id
      )
        return sendError(
          reply,
          409,
          "Your account changed. Reload this page before saving.",
        );
      const origin = request.headers.origin;
      const allowed = new Set([
        "http://localhost:3001",
        "http://localhost:3000",
        new URL(env.APP_URL).origin,
      ]);
      if (!origin || !allowed.has(origin))
        return sendError(reply, 403, "This request must come from LockedIn.");
      const parsed = schema.safeParse(request.body);
      if (!parsed.success)
        return sendError(
          reply,
          400,
          "Please check your settings and try again.",
        );
      // Record pending legacy invitations with the old preference before enabling alerts.
      if (
        "inAppActivity" in parsed.data &&
        parsed.data.inAppActivity &&
        !(await getProfile(user.id)).inAppActivity
      ) {
        while ((await ensureInvitationNotifications(user)) === 100) {
          /* Drain bounded legacy batches under the old preference. */
        }
      }
      return updateProfile(user.id, parsed.data);
    });
  }
}
