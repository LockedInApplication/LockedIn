import { Prisma } from "../../../generated/prisma/client.js";

// Database collation, NOT JavaScript sorting, determines both lock and pair order.
// This is the same account-first lock convention used by direct invitations.
export async function lockDiscoveryUsers(tx: Prisma.TransactionClient, ids: string[]) {
  return tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "user" WHERE "id" IN (${Prisma.join([...new Set(ids)])}) ORDER BY "id" FOR NO KEY UPDATE`;
}
export async function lockDiscoveryConnection(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "DiscoveryConnection" WHERE "id" = ${id} FOR UPDATE`;
}
