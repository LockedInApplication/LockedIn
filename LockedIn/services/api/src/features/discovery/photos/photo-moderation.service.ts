import type { z } from "zod";
import { prisma } from "../../../lib/prisma.js";
import { lockInvitationUsers } from "../../invitations/invitation-access.service.js";
import type { DiscoveryPhoto, Prisma } from "../../../../generated/prisma/client.js";
import { isPhotoModerator } from "./photo-access.service.js";
import { ownPhoto } from "./photo-lifecycle.service.js";
import { explainPhotoScreening } from "./photo-policy.js";
import { queuePhotoDestroy, removePhotoReferences } from "./photo-profile.service.js";
import type { photoReviewSchema } from "./photo.schemas.js";
import type { PhotoProvider } from "./photo.types.js";

const denied = { ok: false as const, status: 403, error: "Moderator access is required." };
const missing = { ok: false as const, status: 404, error: "Photo not found." };
const conflict = { ok: false as const, status: 409, error: "This photo changed or is not eligible for this decision." };
const success = { ok: true as const, value: { saved: true as const } };
const reviewable = (row: DiscoveryPhoto) => !row.deletedAt && !row.revokedAt && !row.destroyedAt && (row.state === "NEEDS_REVIEW" || (row.state === "REJECTED" && row.appealedRevision === row.decisionRevision));

export async function appealPhoto(ownerId: string, id: string, requestId: string, decisionRevision: number) {
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [ownerId]);
    const row = await tx.discoveryPhoto.findFirst({ where: { id, ownerId } });
    if (!row || row.deletedAt || row.revokedAt) return missing;
    const audit = await tx.discoveryPhotoAudit.findUnique({ where: { actorId_requestId: { actorId: ownerId, requestId } } });
    const reason = `Owner appeal of decision ${decisionRevision}`;
    if (audit) return audit.photoId === id && audit.action === "APPEAL" && audit.reason === reason ? success : conflict;
    if (row.decisionRevision !== decisionRevision || !ownPhoto(row).canAppeal || !row.assetId) return conflict;
    await tx.discoveryPhoto.update({ where: { id }, data: { appealedRevision: decisionRevision } });
    await tx.discoveryPhotoAudit.create({ data: { actorId: ownerId, photoId: id, requestId, action: "APPEAL", reason, decisionRevision } });
    return success;
  });
}

export async function listPhotoReviews(actorId: string, before?: string) {
  return prisma.$transaction(async tx => {
    if (!await isPhotoModerator(tx, actorId)) return denied;
    const rows = await tx.discoveryPhoto.findMany({
      where: { ...(before ? { id: { lt: before } } : {}), OR: [
        { revokedAt: null, deletedAt: null, destroyedAt: null, OR: [{ state: "NEEDS_REVIEW" }, { state: "REJECTED", appealedRevision: { not: null } }] },
        { reports: { some: { resolvedAt: null } } },
        { jobs: { some: { failedAt: { not: null }, completedAt: null } } },
      ] },
      orderBy: { id: "desc" }, take: 21,
      include: { audits: { orderBy: { createdAt: "desc" }, take: 10, select: { action: true, reason: true, createdAt: true } }, reports: { where: { resolvedAt: null }, select: { id: true }, take: 1 }, jobs: { where: { failedAt: { not: null }, completedAt: null }, select: { kind: true }, take: 2 } },
    });
    return { ok: true as const, value: { items: rows.slice(0, 20).map(row => ({
      id: row.id, state: row.state, reason: row.reason, decisionRevision: row.decisionRevision, appealed: reviewable(row) && row.state === "REJECTED",
      audits: row.audits, failedJobs: row.jobs.map(job => job.kind), reported: !!row.reports.length, removed: !!(row.revokedAt || row.deletedAt),
      canApprove: reviewable(row) && row.scanCompleted && !!row.assetId,
      canPreview: !row.destroyedAt && !!row.assetId && (reviewable(row) || !!row.reports.length),
      screening: row.scanCompleted && !row.destroyedAt ? explainPhotoScreening(row.screening, row.policyVersion) : null,
    })), nextCursor: rows.length > 20 ? rows[19]!.id : null } };
  });
}

type Review = z.infer<typeof photoReviewSchema>;
export async function reviewPhoto(actorId: string, id: string, input: Review, provider: PhotoProvider) {
  const phase = async <T>(work: (tx: Prisma.TransactionClient, row: DiscoveryPhoto) => Promise<T>) => prisma.$transaction(async tx => {
    if (!await isPhotoModerator(tx, actorId)) return denied;
    const initial = await tx.discoveryPhoto.findUnique({ where: { id }, select: { ownerId: true } });
    if (!initial) return missing;
    await lockInvitationUsers(tx, [...new Set([actorId, initial.ownerId])]);
    if (!await isPhotoModerator(tx, actorId)) return denied;
    const replay = await tx.discoveryPhotoAudit.findUnique({ where: { actorId_requestId: { actorId, requestId: input.requestId } } });
    if (replay) return replay.photoId === id && replay.action === input.action && replay.reason === input.reason && replay.decisionRevision === input.decisionRevision ? success : conflict;
    const row = await tx.discoveryPhoto.findUniqueOrThrow({ where: { id } });
    if (row.decisionRevision !== input.decisionRevision) return conflict;
    if (input.action !== "REMOVE" && !reviewable(row)) return conflict;
    if (input.action === "APPROVE" && (!row.scanCompleted || !row.assetId || !row.publicId || !row.assetVersion)) return conflict;
    return work(tx, row);
  });
  if (input.action === "APPROVE") {
    const prepared = await phase(async (_tx, row) => ({ asset: { assetId: row.assetId!, publicId: row.publicId!, version: row.assetVersion!, format: "jpg" as const } }));
    if (!("asset" in prepared)) return prepared;
    try { await provider.override(prepared.asset, true, input.requestId); }
    catch { return { ok: false as const, status: 503, error: "The photo provider did not confirm approval. Try again." }; }
  }
  return phase(async (tx, row) => {
    const now = new Date();
    if (input.action === "REMOVE" && !row.revokedAt && !row.deletedAt) {
      await removePhotoReferences(tx, row.profileId, id);
      await queuePhotoDestroy(tx, id, row.assetId ? now : new Date(now.getTime() + 60_000));
    }
    await tx.discoveryPhoto.update({ where: { id }, data: {
      state: input.action === "APPROVE" ? "APPROVED" : "REJECTED",
      reason: input.action === "APPROVE" ? "Ready to publish" : "Photo does not meet the discovery photo policy",
      ...(input.action === "REMOVE" ? { revokedAt: row.revokedAt ?? now } : {}),
      appealedRevision: null, decisionRevision: { increment: 1 },
    } });
    await tx.discoveryPhotoAudit.create({ data: { photoId: id, actorId, requestId: input.requestId, action: input.action, reason: input.reason, decisionRevision: input.decisionRevision } });
    return success;
  });
}
