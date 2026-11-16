import type { Prisma } from "../../../generated/prisma/client.js";
import { lockInvitationUsers } from "../invitations/invitation-access.service.js";

export type DiscoveryQuotaAction = "invite" | "report" | "profile" | "candidates" | "draft" | "mutation" | "photo";
export type DiscoveryQuotaResult = { ok: true } | { ok: false; status: 429; error: string; retryAfter: number };
const minute = 60_000, hour = 60 * minute, day = 24 * hour;
const limits: Record<DiscoveryQuotaAction, [number, number][]> = { invite: [[hour, 5], [day, 10]], report: [[day, 5]], profile: [[hour, 20]], candidates: [[minute, 30]], draft: [[minute, 60]], mutation: [[minute, 30]], photo: [[hour, 10], [day, 20]] };

// Call inside the mutation transaction, after detecting idempotent send/report replay.
// Account locks are shared with all pair decisions; repeated acquisition is safe.
export async function consumeDiscoveryQuota(tx: Prisma.TransactionClient, actorId: string, action: DiscoveryQuotaAction, now = new Date()): Promise<DiscoveryQuotaResult> {
  await lockInvitationUsers(tx, [actorId]);
  const windows = limits[action].map(([duration, limit]) => ({ duration, limit, windowStart: new Date(Math.floor(now.getTime() / duration) * duration), key: `${action}:${duration}` }));
  let retryAfter = 0;
  for (const window of windows) {
    const row = await tx.discoveryThrottle.findUnique({ where: { userId_action_windowStart: { userId: actorId, action: window.key, windowStart: window.windowStart } } });
    if ((row?.count ?? 0) >= window.limit) retryAfter = Math.max(retryAfter, Math.ceil((window.windowStart.getTime() + window.duration - now.getTime()) / 1000));
  }
  if (retryAfter) return { ok: false, status: 429, error: "Please wait before trying again.", retryAfter };
  for (const window of windows) await tx.discoveryThrottle.upsert({ where: { userId_action_windowStart: { userId: actorId, action: window.key, windowStart: window.windowStart } }, create: { userId: actorId, action: window.key, windowStart: window.windowStart, count: 1 }, update: { count: { increment: 1 } } });
  return { ok: true };
}
