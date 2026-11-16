import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { lockDiscoveryUsers } from "./discovery-locks.js";
import { privateReflectionSchema } from "./discovery.schemas.js";
import { consumeDiscoveryQuota } from "./discovery-throttle.service.js";
export async function getPrivateReflection(actorId: string) {
  const row = await prisma.privateReflection.findUnique({ where: { ownerId: actorId } });
  return { ok: true as const, value: { text: row?.text ?? "", revision: row?.revision ?? 0 } };
}
export async function savePrivateReflection(actorId: string, input: z.infer<typeof privateReflectionSchema>) {
  const parsed = privateReflectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, status: 400, error: "Please check your reflection." };
  return prisma.$transaction(async tx => {
    await lockDiscoveryUsers(tx, [actorId]);
    const current = await tx.privateReflection.findUnique({ where: { ownerId: actorId } });
    if ((current?.revision ?? 0) !== parsed.data.revision) return { ok: false as const, status: 409, error: "Your reflection changed. Reload before saving." };
    const quota = await consumeDiscoveryQuota(tx, actorId, "draft"); if (!quota.ok) return quota;
    const row = await tx.privateReflection.upsert({ where: { ownerId: actorId }, create: { ownerId: actorId, text: parsed.data.text }, update: { text: parsed.data.text, revision: { increment: 1 } } });
    return { ok: true as const, value: { text: row.text, revision: row.revision } };
  });
}
