import type { Prisma } from "../../../generated/prisma/client.js";

export async function lockDeletionOwner(tx: Prisma.TransactionClient, userId: string) {
  // Serialize with photo jobs and uploads, and prevent new FK references during final deletion.
  const [user] = await tx.$queryRaw<Array<{ email: string }>>`
    SELECT "email" FROM "user" WHERE "id" = ${userId} FOR UPDATE
  `;
  return user;
}

export async function eraseAccountRows(tx: Prisma.TransactionClient, userId: string, email: string) {
  await tx.relationship.updateMany({
    where: { status: "ACTIVE", members: { some: { userId } } }, data: { status: "ENDED" },
  });
  // Room to Talk belongs to the pair. An ended room can't be reopened by either
  // person; erase its shared questions, replies, and takeaways with the account.
  const room = { relationship: { members: { some: { userId } } } };
  await tx.roomTalkTopic.deleteMany({ where: room });
  await tx.roomTalkShelf.deleteMany({ where: room });
  await tx.relationshipInvite.deleteMany({
    where: { inviteeId: null, inviteeEmail: { equals: email, mode: "insensitive" } },
  });
  await tx.verification.deleteMany({ where: { identifier: { startsWith: "reset-password:" }, value: userId } });
  await tx.user.delete({ where: { id: userId } });
}
