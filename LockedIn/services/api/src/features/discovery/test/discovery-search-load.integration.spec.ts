import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { publicDraft } from "./discovery-connection.fixtures.js";

// Opt-in measurement: the local harness supplies a disposable database. Never
// run this against an application DATABASE_URL or a shared database.
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true" || process.env.DISCOVERY_LOAD_TEST !== "true")("dense distance search measurement", () => {
  const env = { ...process.env };
  afterAll(async () => { process.env = env; await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });

  it("serves unique bounded pages for independent concurrent viewers", async () => {
    const database = new URL(process.env.DATABASE_URL!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) || !/^\/lockedin_discovery_test_[a-f0-9]{24}$/.test(database.pathname) || database.search || database.hash) {
      throw new Error("Load measurement requires the local disposable Discovery harness database");
    }
    const { prisma } = await import("../../../lib/prisma.js");
    const { Prisma } = await import("../../../../generated/prisma/client.js");
    const { listDiscoveryCandidates } = await import("../discovery-candidates.service.js");
    const { distanceCandidateQuery } = await import("../discovery-distance-search.js");
    const { getDiscoveryConfig } = await import("../../../config/env.js");
    const population = 5000, concurrency = 16, pagesPerViewer = 10;
    const people = Array.from({ length: population + concurrency }, () => ({ id: randomUUID(), ownerId: `search-load-${randomUUID()}` }));
    const now = new Date();
    const snapshot = { ...publicDraft, areaId: "load-city" };
    for (let start = 0; start < people.length; start += 500) {
      const batch = people.slice(start, start + 500);
      await prisma.user.createMany({ data: batch.map(p => ({ id: p.ownerId, email: `${p.ownerId}@example.test`, emailVerified: true })) });
      await prisma.discoveryProfile.createMany({ data: batch.map(p => ({ ...p, draft: { revision: 1, profile: snapshot }, publishedSnapshot: snapshot, publishedAreaId: "load-city", publishedIntention: "LONG_TERM", adultAttestedAt: now, publicationConsentedAt: now, publishedAt: now, publicationConsentVersion: 1, publicationVersion: 1 })) });
      await prisma.discoveryDistancePreference.createMany({ data: batch.map((p, index) => ({ profileId: p.id, latitude: 40.75 + (index % 5) * 0.025, longitude: -74 + (index % 7) * 0.025, maxDistanceMiles: 50 })) });
    }
    Object.assign(process.env, { DISCOVERY_ENABLED: "true", DISCOVERY_ACCESS_MODE: "open", DISCOVERY_PILOT_USER_IDS: "", DISCOVERY_MODERATOR_USER_IDS: "synthetic-load-moderator", DISCOVERY_AREAS_JSON: '[{"id":"load-city","label":"Synthetic load city"}]' });
    // Representative statistics, without modifying a production schema/index.
    await prisma.$executeRaw`ANALYZE "DiscoveryProfile"`;
    await prisma.$executeRaw`ANALYZE "DiscoveryDistancePreference"`;
    await prisma.$executeRaw`ANALYZE "user"`;
    const range = { latitude: 40.75, longitude: -74, maxDistanceMiles: 50 };
    const query = distanceCandidateQuery(people[0]!.ownerId, range, "LONG_TERM", getDiscoveryConfig());
    const explain = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
    type Plan = { "Node Type": string; "Actual Rows": number; "Index Name"?: string; Plans?: Plan[] };
    const explained = (explain[0]!["QUERY PLAN"] as { Plan: Plan; "Execution Time": number }[])[0]!;
    expect(explained.Plan["Node Type"]).toBe("Limit");
    expect(explained.Plan["Actual Rows"]).toBe(32);
    const indexes: string[] = [];
    const visit = (plan: Plan) => { if (plan["Index Name"]) indexes.push(plan["Index Name"]); plan.Plans?.forEach(visit); };
    visit(explained.Plan);
    const times: number[] = [];
    const failures: string[] = [];
    await Promise.all(people.slice(0, concurrency).map(async viewer => {
      let cursor: string | undefined;
      const seen = new Set<string>();
      for (let page = 0; page < pagesPerViewer; page++) {
        const start = performance.now();
        const result = await listDiscoveryCandidates(viewer.ownerId, { mode: "distance" }, cursor);
        times.push(performance.now() - start);
        if (!result.ok) { failures.push(String(result.status)); break; }
        expect(result.value.items).toHaveLength(12);
        for (const item of result.value.items) {
          expect(item.id).not.toBe(viewer.id);
          expect(seen.has(item.id)).toBe(false);
          seen.add(item.id);
        }
        expect(result.value.nextCursor).toBeTypeOf("string");
        cursor = result.value.nextCursor!;
      }
      expect(seen.size).toBe(pagesPerViewer * 12);
    }));
    times.sort((a, b) => a - b);
    const percentile = (p: number) => Math.round(times[Math.ceil(times.length * p) - 1]! * 10) / 10;
    process.stdout.write(`DISCOVERY_LOAD_RESULT ${JSON.stringify({ population, viewers: concurrency, concurrency, pagesPerViewer, requests: times.length, failures, serviceLatencyMs: { p50: percentile(0.5), p95: percentile(0.95), max: percentile(1) }, sqlExecutionMs: explained["Execution Time"], sqlBatchRows: explained.Plan["Actual Rows"], indexes: [...new Set(indexes)] })}\n`);
    expect(failures).toEqual([]);
    expect(times).toHaveLength(concurrency * pagesPerViewer);
  }, 60_000);
});
