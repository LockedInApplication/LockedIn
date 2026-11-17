import { auth } from "../../lib/auth.js";
import { prisma } from "../../lib/prisma.js";
import { consumeDiscoveryQuota } from "../discovery/discovery-throttle.service.js";

const notSignedIn = {
  ok: false as const, status: 401, error: "Please sign in to continue.",
};
const wrongPassword = {
  ok: false as const, status: 403, error: "The password is incorrect.",
};
const assistedDeletion = {
  ok: false as const, status: 409,
  error: "This account needs a manual deletion review. Contact LockedIn support for help.",
};

export async function deleteOwnAccount(userId: string, password: string) {
  // Commit failed attempts too, without holding a database lock during password hashing.
  const attempt = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return notSignedIn;
    const quota = await consumeDiscoveryQuota(tx, userId, "accountDeletion");
    if (!quota.ok) return quota;
    const credential = await tx.account.findFirst({
      where: { userId, providerId: "credential" },
      select: { id: true, password: true },
    });
    return { ok: true as const, credential };
  });
  if (!attempt.ok) return attempt;
  const credential = attempt.credential;
  if (!credential?.password) return assistedDeletion;
  const context = await auth.$context;
  if (!await context.password.verify({ hash: credential.password, password })) {
    return wrongPassword;
  }

  return prisma.$transaction(async (tx) => {
    // Also prevents new foreign-key references while we check for retained records.
    const [user] = await tx.$queryRaw<Array<{ email: string }>>`
      SELECT "email" FROM "user" WHERE "id" = ${userId} FOR UPDATE
    `;
    if (!user) return notSignedIn;
    const [currentCredential] = await tx.$queryRaw<Array<{ password: string | null }>>`
      SELECT "password" FROM "account" WHERE "id" = ${credential.id} FOR UPDATE
    `;
    if (currentCredential?.password !== credential.password) return wrongPassword;

    // Don't cascade away safety evidence or orphan photos at the storage provider.
    const report = await tx.discoveryReport.findFirst({
      where: { OR: [{ reporterId: userId }, { reportedUserId: userId }] }, select: { id: true },
    });
    const moderation = await tx.discoveryModerationAudit.findFirst({
      where: { OR: [{ moderatorId: userId }, { targetUserId: userId }] }, select: { id: true },
    });
    const photo = await tx.discoveryPhoto.findFirst({
      where: { ownerId: userId }, select: { id: true },
    });
    const photoAudit = await tx.discoveryPhotoAudit.findFirst({
      where: { actorId: userId }, select: { id: true },
    });
    if (report || moderation || photo || photoAudit) return assistedDeletion;

    // Close active spaces without deleting the other person's account or independently owned rows.
    await tx.relationship.updateMany({
      where: { status: "ACTIVE", members: { some: { userId } } },
      data: { status: "ENDED" },
    });
    await tx.relationshipInvite.deleteMany({
      where: { inviteeId: null, inviteeEmail: { equals: user.email, mode: "insensitive" } },
    });
    await tx.verification.deleteMany({
      where: { identifier: { startsWith: "reset-password:" }, value: userId },
    });
    // Postgres cascades personal data, credentials and all sessions together.
    await tx.user.delete({ where: { id: userId } });
    return { ok: true as const };
  });
}
