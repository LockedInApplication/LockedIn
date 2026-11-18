import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { getDiscoveryConfig } from "../../config/env.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { lockDiscoveryUsers } from "./discovery-locks.js";
import { discoveryRestoreSchema, discoveryReviewSchema } from "./discovery.schemas.js";
const denied = { ok: false as const, status: 403, error: "Moderator access is required." };
const missing = { ok: false as const, status: 404, error: "This moderation record is not available." };
const conflict = { ok: false as const, status: 409, error: "This review has already been handled." };
async function allowed(tx: Prisma.TransactionClient, id: string) {
  return getDiscoveryConfig().moderatorUserIds.includes(id) && !!(await tx.user.findUnique({ where: { id }, select: { emailVerified: true } }))?.emailVerified;
}
export async function listDiscoveryReports(moderatorId: string, before?: string) {
  return prisma.$transaction(async tx => {
    if (!await allowed(tx, moderatorId)) return denied;
    const rows = await tx.discoveryReport.findMany({ where: before ? { id: { lt: before } } : {}, orderBy: { id: "desc" }, take: 21, include: { moderationAudits: { select: { id: true, action: true, createdAt: true } }, reportedUser: { select: { discoveryProfile: { select: { id: true, suspendedAt: true } } } } } });
    return { ok: true as const, value: { items: rows.slice(0, 20).map(row => ({ id: row.id, sourceType: row.sourceType, reason: row.reason, detail: row.details, evidence: row.evidence, createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null, profileId: row.reportedUser.discoveryProfile?.id ?? null, suspended: !!row.reportedUser.discoveryProfile?.suspendedAt, audits: row.moderationAudits.map(audit => ({ id: audit.id, action: audit.action, createdAt: audit.createdAt.toISOString() })) })), nextCursor: rows.length > 20 ? rows[19]!.id : null } };
  });
}
export async function reviewDiscoveryReport(moderatorId: string, reportId: string, input: z.infer<typeof discoveryReviewSchema>) {
  const parsed = discoveryReviewSchema.safeParse(input); if (!parsed.success) return conflict;
  return prisma.$transaction(async tx => {
    if (!await allowed(tx, moderatorId)) return denied;
    const report = await tx.discoveryReport.findUnique({ where: { id: reportId } }); if (!report) return missing;
    await lockDiscoveryUsers(tx, [moderatorId, report.reportedUserId]);
    if (!await allowed(tx, moderatorId)) return denied;
    const replay = await tx.discoveryModerationAudit.findUnique({ where: { moderatorId_requestId: { moderatorId, requestId: parsed.data.requestId } } });
    if (replay) return replay.reportId === reportId && replay.action === parsed.data.action ? { ok: true as const, value: { reviewed: true } } : conflict;
    if ((await tx.discoveryReport.findUniqueOrThrow({ where: { id: reportId } })).resolvedAt) return conflict;
    if (parsed.data.action === "SUSPEND") {
      await tx.discoveryProfile.updateMany({ where: { ownerId: report.reportedUserId }, data: { suspendedAt: new Date() } });
      // Holding the target account lock excludes all concurrent pair decisions.
      // Do not acquire peer account locks in a second/reverse order.
      await tx.discoveryConnection.updateMany({ where: { OR: [{ userLowId: report.reportedUserId }, { userHighId: report.reportedUserId }], state: "PROMOTED", lockedInAt: { not: null }, closedAt: null }, data: { closedAt: new Date() } });
      await tx.discoveryConnection.updateMany({ where: { OR: [{ userLowId: report.reportedUserId }, { userHighId: report.reportedUserId }], state: { in: ["PENDING", "ACCEPTED"] } }, data: { state: "CLOSED", closedAt: new Date(), lowReadinessVersion: null, highReadinessVersion: null, consentVersion: { increment: 1 } } });
      await tx.notification.updateMany({ where: { resolvedAt: null, discoveryConnection: { OR: [{ userLowId: report.reportedUserId }, { userHighId: report.reportedUserId }], state: "CLOSED" } }, data: { resolvedAt: new Date() } });
    }
    await tx.discoveryModerationAudit.create({ data: { moderatorId, targetUserId: report.reportedUserId, reportId, action: parsed.data.action, requestId: parsed.data.requestId, reason: report.reason } });
    await tx.discoveryReport.update({ where: { id: reportId }, data: { resolvedAt: new Date() } });
    return { ok: true as const, value: { reviewed: true } };
  });
}
export async function restoreDiscoveryAccount(moderatorId: string, profileId: string, requestId: string) {
  if (!discoveryRestoreSchema.safeParse({ requestId }).success) return conflict;
  return prisma.$transaction(async tx => {
    if (!await allowed(tx, moderatorId)) return denied;
    const profile = await tx.discoveryProfile.findUnique({ where: { id: profileId } }); if (!profile) return missing;
    await lockDiscoveryUsers(tx, [moderatorId, profile.ownerId]);
    if (!await allowed(tx, moderatorId)) return denied;
    const replay = await tx.discoveryModerationAudit.findUnique({ where: { moderatorId_requestId: { moderatorId, requestId } } });
    if (replay) return replay.action === "RESTORE" && replay.targetUserId === profile.ownerId ? { ok: true as const, value: { restored: true } } : conflict;
    await tx.discoveryProfile.update({ where: { id: profileId }, data: { suspendedAt: null } });
    await tx.discoveryModerationAudit.create({ data: { moderatorId, targetUserId: profile.ownerId, action: "RESTORE", requestId, reason: "Moderator restored discovery access" } });
    return { ok: true as const, value: { restored: true } };
  });
}
