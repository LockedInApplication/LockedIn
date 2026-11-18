import { z } from "zod";
import { connectionValue, discoveryPairEligible, withDiscoveryConnection } from "./discovery-connection.service.js";
import { buildReadinessSchema } from "./discovery.schemas.js";
import { consumeDiscoveryQuota } from "./discovery-throttle.service.js";
import { persistDiscoveryTask, resolveDiscoveryTasks } from "./discovery-notifications.service.js";
const unavailable = { ok: false as const, status: 409, error: "Building a shared space is not available right now." };
export async function setBuildReadiness(actorId: string, id: string, input: z.infer<typeof buildReadinessSchema>) {
  const parsed = buildReadinessSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, status: 400, error: "Please check your choice." };
  return withDiscoveryConnection(actorId, id, async (tx, row, notify) => {
    if (row.state === "PROMOTED" && parsed.data.ready) return connectionValue(tx, row, actorId);
    if (row.state !== "ACCEPTED" || row.consentVersion !== parsed.data.consentVersion) return unavailable;
    const low = actorId === row.userLowId;
    const current = low ? row.lowLockInVersion : row.highLockInVersion;
    if (parsed.data.ready) {
      if (!await discoveryPairEligible(tx, row)) return unavailable;
      if (await tx.relationship.findFirst({ where: { status: "ACTIVE", members: { some: { userId: { in: [row.userLowId, row.userHighId] } } } }, select: { id: true } })) return unavailable;
    }
    const desired = parsed.data.ready ? row.consentVersion : null;
    if (current === desired) return connectionValue(tx, row, actorId);
    const quota = await consumeDiscoveryQuota(tx, actorId, "mutation"); if (!quota.ok) return quota;
    let updated = await tx.discoveryConnection.update({ where: { id }, data: low ? { lowLockInVersion: desired } : { highLockInVersion: desired } });
    if (updated.lowLockInVersion === updated.consentVersion && updated.highLockInVersion === updated.consentVersion) {
      // Both accounts are still locked in the legacy invitation convention.
      // No existing space is reused, ended or imported into this new pair.
      const relationship = await tx.relationship.create({ data: { members: { create: [{ userId: updated.userLowId }, { userId: updated.userHighId }] } } });
      const lockedInAt = new Date();
      updated = await tx.discoveryConnection.update({ where: { id }, data: { state: "PROMOTED", relationshipId: relationship.id, lockedInAt } });
      await tx.discoveryProfile.updateMany({ where: { ownerId: { in: [row.userLowId, row.userHighId] } }, data: { pausedAt: lockedInAt } });
      await resolveDiscoveryTasks(tx, id);
      for (const recipient of [row.userLowId, row.userHighId]) notify(recipient, await persistDiscoveryTask(tx, id, recipient, "DISCOVERY_PROMOTED", relationship.id));
    } else {
      const recipient = low ? row.userHighId : row.userLowId;
      if (parsed.data.ready) notify(recipient, await persistDiscoveryTask(tx, id, recipient, "DISCOVERY_BUILD_READY", `${actorId}:${row.consentVersion}:${updated.updatedAt.toISOString()}`));
      else await resolveDiscoveryTasks(tx, id, ["DISCOVERY_BUILD_READY"]);
    }
    return connectionValue(tx, updated, actorId);
  });
}
