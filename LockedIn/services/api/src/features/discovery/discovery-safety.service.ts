import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { invitationBlockBetween, invitationPairWhere, lockInvitationRows } from "../invitations/invitation-access.service.js";
import { listInvitationBlocks, unblockInvitations } from "../invitations/invitation-blocks.service.js";
import { closeDiscoveryContactUnderLock } from "../invitations/invitation-restrictions.service.js";
import { hasDiscoveryPublication, isDiscoveryAdmitted } from "./discovery-profile.service.js";
import { publicDiscoveryProfile } from "./discovery-profile.view.js";
import { lockDiscoveryUsers } from "./discovery-locks.js";
import { discoveryBlockSchema, discoveryReportSchema } from "./discovery.schemas.js";
import { consumeDiscoveryQuota } from "./discovery-throttle.service.js";
const missing = { ok: false as const, status: 404, error: "This content is not available." };
const invalid = { ok: false as const, status: 400, error: "Please check your safety request." };

async function visibleProfile(tx: Prisma.TransactionClient, actorId: string, id: string) {
  const actor = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId } });
  const profile = await tx.discoveryProfile.findUnique({ where: { id } });
  if (!actor || !profile || actorId === profile.ownerId || !await isDiscoveryAdmitted(tx, actorId, actor) || !hasDiscoveryPublication(actor) || !await isDiscoveryAdmitted(tx, profile.ownerId, profile) || !hasDiscoveryPublication(profile) || actor.publishedIntention !== profile.publishedIntention || await invitationBlockBetween(tx, actorId, profile.ownerId)) return null;
  return { targetId: profile.ownerId, label: publicDiscoveryProfile(profile.id, profile.publishedSnapshot)!.publicName, evidence: publicDiscoveryProfile(profile.id, profile.publishedSnapshot)! };
}
async function visibleConnection(tx: Prisma.TransactionClient, actorId: string, id: string) {
  const row = await tx.discoveryConnection.findUnique({ where: { id } });
  if (!row || (row.userLowId !== actorId && row.userHighId !== actorId)) return null;
  const targetId = row.userLowId === actorId ? row.userHighId : row.userLowId;
  const profile = await tx.discoveryProfile.findUnique({ where: { ownerId: targetId }, select: { id: true, publishedSnapshot: true } });
  const label = row.inviterId === targetId ? row.senderPublicName : (profile ? publicDiscoveryProfile(profile.id, profile.publishedSnapshot)?.publicName : null) ?? "Your connection";
  return { row, targetId, label };
}
async function blockUnderLock(tx: Prisma.TransactionClient, actorId: string, targetId: string, label: string) {
  const users = await tx.user.findMany({ where: { id: { in: [actorId, targetId] } }, select: { id: true, email: true } });
  const actor = users.find(user => user.id === actorId)!, target = users.find(user => user.id === targetId)!;
  const pending = await tx.relationshipInvite.findMany({ where: { ...invitationPairWhere(actor, target), status: "PENDING" }, select: { id: true } });
  await lockInvitationRows(tx, pending.map(row => row.id));
  await tx.relationshipInvite.updateMany({ where: { id: { in: pending.map(row => row.id) }, status: "PENDING" }, data: { status: "DECLINED" } });
  await tx.notification.updateMany({ where: { invitationId: { in: pending.map(row => row.id) }, resolvedAt: null }, data: { resolvedAt: new Date() } });
  const block = await tx.invitationBlock.upsert({ where: { blockerId_blockedId: { blockerId: actorId, blockedId: targetId } }, create: { blockerId: actorId, blockedId: targetId, safePublicLabel: label }, update: { safePublicLabel: label } });
  await closeDiscoveryContactUnderLock(tx, actorId, targetId);
  return block;
}
export async function blockDiscoveryContact(actorId: string, input: z.infer<typeof discoveryBlockSchema>) {
  const parsed = discoveryBlockSchema.safeParse(input); if (!parsed.success) return invalid;
  return prisma.$transaction(async tx => {
    const resolve = () => parsed.data.connectionId ? visibleConnection(tx, actorId, parsed.data.connectionId) : visibleProfile(tx, actorId, parsed.data.profileId!);
    const initial = await resolve(); if (!initial) return missing;
    await lockDiscoveryUsers(tx, [actorId, initial.targetId]);
    const source = await resolve(); if (!source) return missing;
    const existing = await tx.invitationBlock.findUnique({ where: { blockerId_blockedId: { blockerId: actorId, blockedId: source.targetId } } });
    if (existing) return { ok: true as const, value: { id: existing.id } };
    const quota = await consumeDiscoveryQuota(tx, actorId, "mutation"); if (!quota.ok) return quota;
    const block = await blockUnderLock(tx, actorId, source.targetId, source.label);
    return { ok: true as const, value: { id: block.id } };
  });
}
export async function listDiscoveryBlocks(actorId: string, before?: string) {
  const result = await listInvitationBlocks(actorId, before);
  return result.ok ? { ok: true as const, value: { items: result.items, nextCursor: result.nextCursor } } : result;
}
export async function unblockDiscoveryContact(actorId: string, blockId: string) {
  const result = await unblockInvitations(blockId, actorId);
  return result.ok ? { ok: true as const, value: { unblocked: true } } : result;
}
async function reportSource(tx: Prisma.TransactionClient, actorId: string, sourceType: string, sourceId: string) {
  if (sourceType === "PROFILE") {
    const profile = await visibleProfile(tx, actorId, sourceId);
    return profile ? { ...profile, connectionId: null } : null;
  }
  const shared = sourceType === "SHARED_RESPONSE" ? await tx.discoverySharedResponse.findUnique({ where: { id: sourceId } }) : null;
  if (sourceType === "SHARED_RESPONSE" && (!shared || shared.ownerId === actorId)) return null;
  const connection = await visibleConnection(tx, actorId, shared?.connectionId ?? sourceId);
  if (!connection || (sourceType === "INVITATION" && connection.row.inviterId === actorId)) return null;
  const evidence = shared ? { text: shared.text, version: shared.version, sharedAt: shared.sharedAt.toISOString(), publicName: connection.label } : { questionKey: connection.row.questionKey, questionText: connection.row.questionText, hello: connection.row.hello, publicName: connection.row.senderPublicName, avatarPreset: connection.row.senderAvatarPreset };
  return { targetId: connection.targetId, label: connection.label, connectionId: connection.row.id, evidence };
}
export async function reportDiscoveryContent(actorId: string, input: z.infer<typeof discoveryReportSchema>) {
  const parsed = discoveryReportSchema.safeParse(input); if (!parsed.success) return invalid;
  const data = parsed.data;
  return prisma.$transaction(async tx => {
    // A previous receipt belongs to this reporter even when the public card
    // is now hidden (including when this very report also blocked it).
    const prior = await tx.discoveryReport.findUnique({ where: { reporterId_requestId: { reporterId: actorId, requestId: data.requestId } } });
    if (prior) {
      await lockDiscoveryUsers(tx, [actorId, prior.reportedUserId]);
      return prior.sourceType === data.sourceType && prior.sourceId === data.sourceId ? { ok: true as const, value: { id: prior.id, received: true } } : invalid;
    }
    const initial = await reportSource(tx, actorId, data.sourceType, data.sourceId); if (!initial) return missing;
    await lockDiscoveryUsers(tx, [actorId, initial.targetId]);
    const replay = await tx.discoveryReport.findUnique({ where: { reporterId_requestId: { reporterId: actorId, requestId: data.requestId } } });
    if (replay) return replay.sourceType === data.sourceType && replay.sourceId === data.sourceId ? { ok: true as const, value: { id: replay.id, received: true } } : invalid;
    const source = await reportSource(tx, actorId, data.sourceType, data.sourceId); if (!source) return missing;
    const quota = await consumeDiscoveryQuota(tx, actorId, "report"); if (!quota.ok) return quota;
    const report = await tx.discoveryReport.create({ data: { reporterId: actorId, reportedUserId: source.targetId, connectionId: source.connectionId, reason: data.reason, details: data.detail ?? null, requestId: data.requestId, sourceType: data.sourceType, sourceId: data.sourceId, evidence: source.evidence } });
    if (data.blockAlso) await blockUnderLock(tx, actorId, source.targetId, source.label);
    return { ok: true as const, value: { id: report.id, received: true } };
  });
}
