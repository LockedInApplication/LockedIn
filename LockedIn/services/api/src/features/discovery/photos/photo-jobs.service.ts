import { randomUUID } from "node:crypto";
import { prisma } from "../../../lib/prisma.js";
import { lockInvitationUsers } from "../../invitations/invitation-access.service.js";
import { finalizePhotoUpload } from "./photo-lifecycle.service.js";
import { classifyPhoto } from "./photo-policy.js";
import { queuePhotoDestroy, removePhotoReferences } from "./photo-profile.service.js";
import type { PhotoProvider } from "./photo.types.js";

const day = 86_400_000;
const minute = 60_000;
const later = (now: Date, ms: number) => new Date(now.getTime() + ms);

async function expireOldPhotos(now: Date, batchSize: number) {
  const cutoff = later(now, -7 * day);
  const where = { state: { in: ["PROCESSING", "CHECK_FAILED", "NEEDS_REVIEW", "REJECTED"] as const }, revokedAt: null, destroyedAt: null, createdAt: { lte: cutoff } };
  const rows = await prisma.discoveryPhoto.findMany({ where: { ...where, state: { in: [...where.state.in] } }, orderBy: { createdAt: "asc" }, take: batchSize, select: { id: true, ownerId: true } });
  for (const candidate of rows) await prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [candidate.ownerId]);
    const row = await tx.discoveryPhoto.findFirst({ where: { ...where, state: { in: [...where.state.in] }, id: candidate.id } });
    if (!row) return;
    await removePhotoReferences(tx, row.profileId, row.id);
    await tx.discoveryPhoto.update({ where: { id: row.id }, data: { revokedAt: now, decisionRevision: { increment: 1 } } });
    await queuePhotoDestroy(tx, row.id, now);
  });
}

export async function runPhotoJobs({ provider, now = new Date(), batchSize = 15 }: { provider: PhotoProvider; now?: Date; batchSize?: number }) {
  const startedAt = Date.now();
  const clock = () => later(now, Math.max(0, Date.now() - startedAt));
  const take = Math.min(50, Math.max(1, Math.floor(batchSize) || 15));
  await expireOldPhotos(now, take);
  const due = { completedAt: null, failedAt: null, dueAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] };
  const candidates = await prisma.discoveryPhotoJob.findMany({ where: due, orderBy: { dueAt: "asc" }, take });
  let processed = 0, failed = 0;
  for (const job of candidates) {
    const leaseToken = randomUUID();
    const claimedAt = clock();
    const claim = await prisma.discoveryPhotoJob.updateMany({ where: { id: job.id, ...due }, data: { leaseToken, leaseUntil: later(claimedAt, 2 * minute), attempts: { increment: 1 } } });
    if (claim.count !== 1) continue;
    processed++;
    const settle = async (data: Parameters<typeof prisma.discoveryPhotoJob.updateMany>[0]["data"]) => prisma.discoveryPhotoJob.updateMany({ where: { id: job.id, leaseToken }, data: { ...data, leaseToken: null, leaseUntil: null } });
    try {
      const row = await prisma.discoveryPhoto.findUniqueOrThrow({ where: { id: job.photoId } });
      if (job.kind === "RECONCILE") {
        if (row.deletedAt || row.revokedAt || row.destroyedAt || row.scanCompleted) { await settle({ completedAt: now }); continue; }
        const deadline = row.createdAt.getTime() <= now.getTime() - day;
        const result = row.publicId && (!deadline || job.attempts === 0) ? await provider.inspect({ publicId: row.publicId }) : null;
        if (deadline && !classifyPhoto(result?.screening).complete) {
          await prisma.$transaction(async tx => {
            await lockInvitationUsers(tx, [row.ownerId]);
            const active = await tx.discoveryPhotoJob.updateMany({ where: { id: job.id, leaseToken, leaseUntil: { gt: clock() }, completedAt: null }, data: { leaseToken } });
            if (active.count) await tx.discoveryPhoto.updateMany({ where: { id: row.id, revokedAt: null, deletedAt: null, scanCompleted: false, state: "PROCESSING" }, data: { state: "CHECK_FAILED", reason: "Photo screening could not be completed", decisionRevision: { increment: 1 } } });
          });
          await settle({ failedAt: now, lastError: "Screening exceeded 24 hours" }); failed++; continue;
        }
        const finalized = await finalizePhotoUpload(row.ownerId, row.id, result, { id: job.id, token: leaseToken, clock });
        await settle({ dueAt: later(now, Math.min(60, 2 ** Math.min(6, job.attempts)) * minute), lastError: finalized.ok ? null : "Photo not eligible for reconciliation" });
      } else {
        const disposition = await prisma.$transaction(async tx => {
          await lockInvitationUsers(tx, [row.ownerId]);
          const current = await tx.discoveryPhoto.findUniqueOrThrow({ where: { id: row.id } });
          if (!current.revokedAt && !current.deletedAt) return { skip: true as const };
          const latest = await tx.discoveryReport.findFirst({ where: { photoId: row.id }, orderBy: { resolvedAt: { sort: "desc", nulls: "first" } }, select: { resolvedAt: true } });
          if (latest && !latest.resolvedAt) return { wait: later(now, day) };
          const until = Math.max(current.retentionUntil?.getTime() ?? 0, latest?.resolvedAt ? latest.resolvedAt.getTime() + 30 * day : 0);
          if (until > now.getTime()) return { wait: new Date(until) };
          return { publicId: current.publicId, previouslyObserved: !!current.assetId, createdAt: current.createdAt };
        });
        if (disposition.skip) { await settle({ completedAt: now }); continue; }
        if (disposition.wait) { await settle({ dueAt: disposition.wait, attempts: 0 }); continue; }
        const erased = disposition.publicId ? await provider.destroy({ publicId: disposition.publicId }) : undefined;
        if (erased === "missing" && !disposition.previouslyObserved) {
          // A timed-out upload may commit after a successful "not found" response.
          // Keep its deterministic key until destruction is confirmed or an operator takes over.
          const unresolved = +now - +disposition.createdAt >= 7 * day;
          await settle({ dueAt: later(now, day), lastError: "Awaiting confirmation of an ambiguous upload", ...(unresolved ? { failedAt: now } : {}) });
          if (unresolved) failed++;
          continue;
        }
        await prisma.$transaction(async tx => {
          await lockInvitationUsers(tx, [row.ownerId]);
          const current = await tx.discoveryPhotoJob.updateMany({ where: { id: job.id, leaseToken, leaseUntil: { gt: clock() }, completedAt: null }, data: { completedAt: now, leaseToken: null, leaseUntil: null } });
          if (!current.count) return;
          await tx.discoveryPhoto.updateMany({ where: { id: row.id, destroyedAt: null }, data: { destroyedAt: now, publicId: null, assetId: null, assetVersion: null, decisionRevision: { increment: 1 } } });
        });
      }
    } catch {
      failed++;
      const retryAfter = Math.min(60, 2 ** Math.min(6, job.attempts)) * minute;
      const exhausted = job.kind === "DESTROY" && job.attempts >= 9;
      await settle({ lastError: "Photo provider operation failed", dueAt: later(now, retryAfter), ...(exhausted ? { failedAt: now } : {}) });
    }
  }
  return { processed, failed };
}
