import { prisma } from "../../lib/prisma.js";

export async function getTogetherReportingPreference(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { togetherReportingOptedOutAt: true },
  });
  return { optedOut: user.togetherReportingOptedOutAt !== null };
}

export async function optOutOfTogetherReporting(userId: string) {
  await prisma.$transaction(async tx => {
    await tx.user.updateMany({
      where: { id: userId, togetherReportingOptedOutAt: null },
      data: { togetherReportingOptedOutAt: new Date() },
    });
    // Withdraw existing enrollments, not the plans, memories, or relationships.
    // The report also checks the account flag so a later stale entry cannot count.
    await tx.$executeRaw`
      DELETE FROM lockedin_reporting.pilot_pair AS enrollment
      USING public."RelationshipMember" AS member
      WHERE member."userId" = ${userId} AND member."relationshipId" = enrollment.relationship_id
    `;
  });
  return { optedOut: true };
}
