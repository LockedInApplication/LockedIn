import { z } from "zod";
import { connectionValue, discoveryPairEligible, withDiscoveryConnection } from "./discovery-connection.service.js";
import { starterDraftSchema, starterShareSchema } from "./discovery.schemas.js";
import { consumeDiscoveryQuota } from "./discovery-throttle.service.js";
import { persistDiscoveryTask } from "./discovery-notifications.service.js";
const stale = { ok: false as const, status: 409, error: "Your response changed. Reload before saving or sharing." };
const unavailable = { ok: false as const, status: 409, error: "This action is not available right now." };
const invalid = { ok: false as const, status: 400, error: "Please check your response." };

export async function saveStarterDraft(actorId: string, id: string, input: z.infer<typeof starterDraftSchema>) {
  const parsed = starterDraftSchema.safeParse(input); if (!parsed.success) return invalid;
  return withDiscoveryConnection(actorId, id, async (tx, row) => {
    if (row.state !== "ACCEPTED" || !await discoveryPairEligible(tx, row)) return unavailable;
    const own = await tx.discoveryDraft.findUnique({ where: { connectionId_ownerId: { connectionId: id, ownerId: actorId } } });
    if ((own?.revision ?? 0) !== parsed.data.revision) return stale;
    const quota = await consumeDiscoveryQuota(tx, actorId, "draft"); if (!quota.ok) return quota;
    await tx.discoveryDraft.upsert({ where: { connectionId_ownerId: { connectionId: id, ownerId: actorId } }, create: { connectionId: id, ownerId: actorId, text: parsed.data.text }, update: { text: parsed.data.text, revision: { increment: 1 } } });
    return connectionValue(tx, row, actorId);
  });
}
export async function shareStarterDraft(actorId: string, id: string, input: z.infer<typeof starterShareSchema>) {
  const parsed = starterShareSchema.safeParse(input); if (!parsed.success) return invalid;
  return withDiscoveryConnection(actorId, id, async (tx, row, notify) => {
    const replay = await tx.discoverySharedResponse.findUnique({ where: { connectionId_ownerId_requestId: { connectionId: id, ownerId: actorId, requestId: parsed.data.requestId } } });
    if (replay) return connectionValue(tx, row, actorId);
    if (row.state !== "ACCEPTED" || !await discoveryPairEligible(tx, row)) return unavailable;
    const own = await tx.discoveryDraft.findUnique({ where: { connectionId_ownerId: { connectionId: id, ownerId: actorId } } });
    if (!own || own.revision !== parsed.data.draftRevision) return stale;
    if (!own.text.trim()) return invalid;
    const quota = await consumeDiscoveryQuota(tx, actorId, "mutation"); if (!quota.ok) return quota;
    const latest = await tx.discoverySharedResponse.findFirst({ where: { connectionId: id, ownerId: actorId }, orderBy: { version: "desc" }, select: { version: true } });
    const shared = await tx.discoverySharedResponse.create({ data: { connectionId: id, ownerId: actorId, requestId: parsed.data.requestId, text: own.text, version: (latest?.version ?? 0) + 1 } });
    await tx.discoveryConnection.update({ where: { id }, data: { updatedAt: new Date() } });
    const recipient = row.userLowId === actorId ? row.userHighId : row.userLowId;
    notify(recipient, await persistDiscoveryTask(tx, id, recipient, "DISCOVERY_RESPONSE_SHARED", shared.id));
    return connectionValue(tx, row, actorId);
  });
}
