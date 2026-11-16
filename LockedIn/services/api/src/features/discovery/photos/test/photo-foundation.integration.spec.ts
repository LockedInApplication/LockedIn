import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("discovery photo database invariants", () => {
  afterAll(async () => (await import("../../../../lib/prisma.js")).prisma.$disconnect());
  it("persists photo ownership, request idempotency, jobs and audited decisions without crossing profile ownership", async () => {
    const { prisma } = await import("../../../../lib/prisma.js");
    const a = await prisma.user.create({ data: { id: randomUUID(), email: `${randomUUID()}@example.test`, updatedAt: new Date() } });
    const b = await prisma.user.create({ data: { id: randomUUID(), email: `${randomUUID()}@example.test`, updatedAt: new Date() } });
    const profile = await prisma.discoveryProfile.create({ data: { ownerId: a.id, draft: { revision: 0 } } });
    const photo = randomUUID(), request = randomUUID(), job = randomUUID(), decision = randomUUID();
    const insert = (id: string, owner: string, req = request) => prisma.$executeRaw`INSERT INTO "DiscoveryPhoto" (id,"ownerId","profileId","requestId","payloadHash","updatedAt") VALUES (${id},${owner},${profile.id},${req},${"a".repeat(64)},NOW())`;
    // Missing table is an observed foundation failure, not an uncaught suite error.
    const inserted = await insert(photo, a.id).then(() => true, () => false);
    expect(inserted).toBe(true);
    await expect(prisma.$executeRaw`UPDATE "DiscoveryPhoto" SET width=100 WHERE id=${photo}`).rejects.toThrow();
    await expect(prisma.$executeRaw`UPDATE "DiscoveryPhoto" SET "assetId"='partial',"publicId"='partial' WHERE id=${photo}`).rejects.toThrow();
    await expect(insert(randomUUID(), a.id)).rejects.toThrow();
    await expect(insert(randomUUID(), b.id, randomUUID())).rejects.toThrow();
    await prisma.$executeRaw`INSERT INTO "DiscoveryPhotoJob" (id,"photoId",kind,"dedupeKey","updatedAt") VALUES (${job},${photo},'RECONCILE',${photo + ":upload"},NOW())`;
    await expect(prisma.$executeRaw`INSERT INTO "DiscoveryPhotoJob" (id,"photoId",kind,"dedupeKey","updatedAt") VALUES (${randomUUID()},${photo},'RECONCILE',${photo + ":upload"},NOW())`).rejects.toThrow();
    const audit = () => prisma.$executeRaw`INSERT INTO "DiscoveryPhotoAudit" (id,"photoId","actorId",action,reason,"requestId","decisionRevision") VALUES (${randomUUID()},${photo},${a.id},'REJECT','Review reason',${decision},1)`;
    await audit(); await expect(audit()).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM "DiscoveryPhoto" WHERE id=${photo}`).rejects.toThrow();
  });
});
