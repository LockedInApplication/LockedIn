import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson, discoveryRequest } from "./discovery.fixtures.js";

vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("database discovery quotas", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  const oldEnv = { ...process.env };
  beforeAll(async () => { server = await (await import("../../../app.js")).buildServer(); await server.listen({ port: 0, host: "127.0.0.1" }); });
  afterAll(async () => { process.env = oldEnv; await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });
  it("serializes concurrent mutations and returns Retry-After at the minute limit", async () => {
    const a = await createPerson();
    Object.assign(process.env, { DISCOVERY_ENABLED: "true", DISCOVERY_PILOT_USER_IDS: a.id, DISCOVERY_MODERATOR_USER_IDS: "synthetic-moderator", DISCOVERY_AREAS_JSON: '[{"id":"pilot-city","label":"Pilot city"}]' });
    const request = discoveryRequest(server);
    const results = await Promise.all(Array.from({ length: 25 }, () => request(a, "POST", "/api/discovery/profile/visibility", { paused: true })));
    // Visibility has the other-state-mutation limit (30/minute).
    expect(results.every(result => result.statusCode === 200)).toBe(true);
    const more = await Promise.all(Array.from({ length: 10 }, () => request(a, "POST", "/api/discovery/profile/visibility", { paused: true })));
    expect(more.filter(result => result.statusCode === 200)).toHaveLength(5);
    const limited = more.filter(result => result.statusCode === 429);
    expect(limited).toHaveLength(5);
    expect(Number(limited[0]!.headers["retry-after"])).toBeGreaterThan(0);
    const { prisma } = await import("../../../lib/prisma.js");
    expect((await prisma.discoveryThrottle.findMany({ where: { userId: a.id } })).map(row => row.count)).toEqual([30]);
  });
  it("enforces invite hourly and daily ceilings without consuming a second window on rejection", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const { consumeDiscoveryQuota } = await import("../discovery-throttle.service.js");
    const a = await createPerson();
    const consume = (now: string) => prisma.$transaction(tx => consumeDiscoveryQuota(tx, a.id, "invite", new Date(now)));
    const first = await Promise.all(Array.from({ length: 9 }, () => consume("2026-01-01T12:15:00Z")));
    expect(first.filter(result => result.ok)).toHaveLength(5);
    expect(first.filter(result => !result.ok)).toHaveLength(4);
    expect(first.find(result => !result.ok)).toMatchObject({ status: 429, retryAfter: 2700 });
    expect((await prisma.discoveryThrottle.findMany({ where: { userId: a.id }, orderBy: { action: "asc" } })).map(row => row.count)).toEqual([5, 5]);
    for (let i = 0; i < 5; i++) expect(await consume("2026-01-01T13:15:00Z")).toEqual({ ok: true });
    expect(await consume("2026-01-01T14:15:00Z")).toMatchObject({ ok: false, status: 429, retryAfter: 35100 });
    expect(await consume("2026-01-02T00:00:00Z")).toEqual({ ok: true });
  });
  it.each([["report", 5, "2026-01-02T00:00:00Z"], ["profile", 20, "2026-01-01T13:00:00Z"], ["candidates", 30, "2026-01-01T12:16:00Z"], ["draft", 60, "2026-01-01T12:16:00Z"]] as const)("limits %s and resets only at its database window", async (action, limit, reset) => {
    const { prisma } = await import("../../../lib/prisma.js");
    const { consumeDiscoveryQuota } = await import("../discovery-throttle.service.js");
    const a = await createPerson();
    const consume = (now: string) => prisma.$transaction(tx => consumeDiscoveryQuota(tx, a.id, action, new Date(now)));
    const results = await Promise.all(Array.from({ length: limit + 3 }, () => consume("2026-01-01T12:15:00Z")));
    expect(results.filter(result => result.ok)).toHaveLength(limit);
    expect(results.filter(result => !result.ok)).toHaveLength(3);
    expect(await consume(reset)).toEqual({ ok: true });
  });
});
