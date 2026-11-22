import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

export const automaticPhotoDeletionEnabled = () => process.env.ACCOUNT_PHOTO_DELETION_ENABLED === "true";

// A manual request keeps the account active. A confirmed automatic deletion does not.
export async function accountDeletionInProgress(userId: string, db: Pick<Prisma.TransactionClient, "accountDeletionRequest"> = prisma) {
  const row = await db.accountDeletionRequest.findUnique({ where: { userId }, select: { state: true } });
  return !!row && row.state !== "MANUAL_REQUEST";
}
