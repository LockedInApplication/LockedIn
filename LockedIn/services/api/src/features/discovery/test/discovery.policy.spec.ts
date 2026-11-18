import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson, discoveryRequest } from "./discovery.fixtures.js";
import { parseDiscoveryConfig } from "../discovery.config.js";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

const configured = { DISCOVERY_ENABLED: "true", DISCOVERY_PILOT_USER_IDS: "pilot-a,pilot-b", DISCOVERY_MODERATOR_USER_IDS: "moderator", DISCOVERY_AREAS_JSON: '[{"id":"test-area","label":"Synthetic area"}]' };
describe("discovery configuration admission", () => {
  it("defaults to pilot and accepts only explicit open mode", () => {
    expect(parseDiscoveryConfig(configured)).toMatchObject({ accessMode: "pilot", admissionConfigured: true });
    expect(parseDiscoveryConfig({ ...configured, DISCOVERY_ACCESS_MODE: "open" })).toMatchObject({ accessMode: "open", admissionConfigured: true });
    for (const mode of ["", "OPEN", "public", "typo"]) {
      expect(parseDiscoveryConfig({ ...configured, DISCOVERY_ACCESS_MODE: mode }).admissionConfigured).toBe(false);
    }
    expect(parseDiscoveryConfig({ ...configured, DISCOVERY_ACCESS_MODE: "open", DISCOVERY_MODERATOR_USER_IDS: "" }).admissionConfigured).toBe(false);
  });
  it.each([
    "", "postgresql://unused:unused@remote.example/postgres", "https://localhost/postgres",
    "postgresql://unused:unused@127.0.0.1/postgres?host=remote.example",
    "postgresql://unused:unused@localhost/postgres?hostaddr=203.0.113.1",
    "postgresql://unused:unused@127.0.0.1/postgres?port=6543",
    "postgresql://unused:unused@127.0.0.1/postgres?sslmode=require",
    "postgresql://unused:unused@127.0.0.1/postgres#untrusted-options",
  ])("rejects unsafe harness admin URL %s without application database fallback", adminUrl => {
    // Patch only the connection boundary in this owned child: a missing guard must
    // fail observably without DNS, a socket, or any remote/database side effect.
    const pgModule = new URL("../../../../../node_modules/pg/lib/index.js", import.meta.url).href;
    const noConnections = `import pg from ${JSON.stringify(pgModule)}; pg.Client.prototype.connect = async () => { throw new Error("TEST_BLOCKED_DATABASE_CONNECT"); };`;
    const result = spawnSync(process.execPath, [`--import=data:text/javascript,${encodeURIComponent(noConnections)}`, fileURLToPath(new URL("../../../../../scripts/verify-discovery.mjs", import.meta.url))], { env: { ...process.env, DISCOVERY_TEST_ADMIN_URL: adminUrl, DATABASE_URL: "postgresql://forbidden-app-db.example/never-use" }, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/DISCOVERY_TEST_ADMIN_URL is required|explicit local PostgreSQL admin URL/);
    expect(result.stderr).not.toMatch(/ENOTFOUND|ECONNREFUSED|connect EPERM/);
    expect(result.stderr).not.toContain("TEST_BLOCKED_DATABASE_CONNECT");
  });
  it("defaults to no admission without seeding live people or areas", () => {
    expect(parseDiscoveryConfig({})).toMatchObject({ enabled: false, pilotUserIds: [], moderatorUserIds: [], areas: [], admissionConfigured: false });
  });
  it.each([undefined, "", "not-json", "[]", '[{"id":"x","label":"X","latitude":1}]', '[{"id":"x","label":"X"},{"id":"x","label":"Y"}]'])('fails closed for invalid catalog %s', catalog => {
    expect(parseDiscoveryConfig({ ...configured, DISCOVERY_AREAS_JSON: catalog }).admissionConfigured).toBe(false);
  });
  it("requires explicit valid moderators and strict true enablement", () => {
    expect(parseDiscoveryConfig({ ...configured, DISCOVERY_MODERATOR_USER_IDS: "" }).admissionConfigured).toBe(false);
    expect(parseDiscoveryConfig({ ...configured, DISCOVERY_ENABLED: "TRUE" }).enabled).toBe(false);
    expect(parseDiscoveryConfig(configured)).toMatchObject({ enabled: true, admissionConfigured: true, areas: [{ id: "test-area", label: "Synthetic area" }] });
  });
});

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("discovery policy and mutation boundaries", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  let a: Awaited<ReturnType<typeof createPerson>>, b: typeof a;
  beforeAll(async () => {
    const { z } = await import("zod");
    const { requireDiscoveryMutation } = await import("../discovery.http.js");
    server = await (await import("../../../app.js")).buildServer();
    server.post("/test-only/discovery/:id", { config: { discoveryValidation: { body: z.object({ text: z.string().min(1) }), params: z.object({ id: z.string().uuid() }) } } }, async (req, reply) => {
      const context = await requireDiscoveryMutation(req, reply);
      if (context) return { ownerId: context.userId, value: { saved: true } };
    });
    server.post("/test-only/discovery-empty", async (req, reply) => {
      const context = await requireDiscoveryMutation(req, reply);
      if (context) return { ownerId: context.userId, value: true };
    });
    await server.listen({ port: 0, host: "127.0.0.1" });
    a = await createPerson(); b = await createPerson();
  });
  afterAll(async () => { await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });
  const url = "/test-only/discovery/123e4567-e89b-42d3-a456-426614174000";
  const mutation = (headers: Record<string,string>, payload: object = { text: "private draft" }, target = url) => server.inject({ method: "POST", url: target, headers: { cookie: a.cookie, ...headers }, payload });
  it.each([
    ["missing Origin", { "x-discovery-owner": "MATCH" }, 403],
    ["untrusted Origin", { origin: "https://attacker.example", "x-discovery-owner": "MATCH" }, 403],
    ["missing owner", { origin: "http://localhost:3001" }, 409],
    ["wrong owner", { origin: "http://localhost:3001", "x-discovery-owner": "wrong-owner" }, 409],
  ] as const)("rejects %s mutations", async (_name, input, status) => {
    const headers = Object.fromEntries(Object.entries(input).map(([k,v]) => [k, v === "MATCH" ? a.id : v]));
    const response = await mutation(headers);
    expect(response.statusCode).toBe(status); expect(response.json()).toHaveProperty("error");
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
  it("rejects anonymous mutations, malformed params and unknown body properties", async () => {
    expect((await server.inject({ method: "POST", url, payload: { text: "draft" } })).statusCode).toBe(401);
    const headers = { origin: "http://localhost:3001", "x-discovery-owner": a.id };
    expect((await mutation(headers, { text: "draft", ownerId: b.id })).statusCode).toBe(400);
    expect((await mutation(headers, { text: "draft" }, "/test-only/discovery/not-a-uuid")).statusCode).toBe(400);
    expect((await mutation(headers, { unknown: true }, "/test-only/discovery-empty")).statusCode).toBe(400);
    expect((await mutation(headers)).json()).toEqual({ ownerId: a.id, value: { saved: true } });
  });
  it("retains existing history with rollout off and reports active relationship without disabling exploration", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const { getDiscoveryCapabilities } = await import("../discovery.policy.js");
    const relationship = await prisma.relationship.create({ data: { members: { create: [{ userId: a.id }, { userId: b.id }] } } });
    await prisma.discoveryConnection.create({ data: { userLowId: [a.id,b.id].sort()[0]!, userHighId: [a.id,b.id].sort()[1]!, inviterId: a.id, questionKey: "synthetic", questionText: "A synthetic test question?", hello: "Hello", senderPublicName: "Public alias", senderAvatarPreset: "initials", state: "CLOSED", expiresAt: new Date() } });
    expect(await getDiscoveryCapabilities({ userId: a.id, emailVerified: true })).toMatchObject({ canDiscover: false, canChat: false, discoveryLockedIn: false, canModerate: false, canReflect: true, hasHistory: true, currentRelationshipId: relationship.id });
    expect((await discoveryRequest(server)(a, "GET", "/api/discovery/me")).json()).toMatchObject({ ownerId: a.id, value: { canDiscover: false, hasHistory: true } });
    const old = { ...process.env };
    try {
      Object.assign(process.env, configured, { DISCOVERY_PILOT_USER_IDS: a.id });
      expect(await getDiscoveryCapabilities({ userId: a.id, emailVerified: true })).toMatchObject({ canDiscover: true, hasHistory: true, currentRelationshipId: relationship.id });
      expect(await getDiscoveryCapabilities({ userId: a.id, emailVerified: false })).toMatchObject({ canDiscover: false, hasHistory: true });
      expect(await getDiscoveryCapabilities({ userId: b.id, emailVerified: true })).toMatchObject({ canDiscover: false });
      process.env.DISCOVERY_MODERATOR_USER_IDS = a.id;
      expect(await getDiscoveryCapabilities({ userId: a.id, emailVerified: true })).toMatchObject({ canModerate: true });
      process.env.DISCOVERY_AREAS_JSON = "invalid";
      expect(await getDiscoveryCapabilities({ userId: a.id, emailVerified: true })).toMatchObject({ canDiscover: false, canModerate: true, hasHistory: true });
      process.env.DISCOVERY_AREAS_JSON = configured.DISCOVERY_AREAS_JSON;
      await prisma.discoveryProfile.create({ data: { ownerId: a.id, draft: {}, suspendedAt: new Date() } });
      expect(await getDiscoveryCapabilities({ userId: a.id, emailVerified: true })).toMatchObject({ canDiscover: false, hasHistory: true });
    } finally { process.env = old; }
  });
  it("allows the owner header through CORS without changing legacy origins", async () => {
    const response = await server.inject({ method: "OPTIONS", url: "/api/discovery/me", headers: { origin: "http://localhost:3001", "access-control-request-method": "GET", "access-control-request-headers": "x-discovery-owner" } });
    expect(response.headers["access-control-allow-headers"]).toContain("X-Discovery-Owner");
  });
});
