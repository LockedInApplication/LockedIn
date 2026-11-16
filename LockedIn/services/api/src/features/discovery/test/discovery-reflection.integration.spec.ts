import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures } from "./discovery-connection.fixtures.js";
vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("standalone owner-only reflection", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>, f: ReturnType<typeof connectionFixtures>;
  const oldEnv = { ...process.env };
  beforeAll(async () => { server = await (await import("../../../app.js")).buildServer(); await server.listen({ port: 0, host: "127.0.0.1" }); f = connectionFixtures(server); });
  afterAll(async () => { process.env = oldEnv; await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });
  it("stores only the authenticated owner's text with revisions, independent of rollout and relationships", async () => {
    const { prisma } = await import("../../../lib/prisma.js");
    const a = await f.person(), b = await f.person();
    const initial = await f.request(a, "GET", "/api/discovery/reflection"); expect(initial.statusCode).toBe(200);
    expect(initial.json().value).toEqual({ text: "", revision: 0 });
    const saved = await f.request(a, "PUT", "/api/discovery/reflection", { text: "Private solo reflection", revision: 0 });
    expect(saved.statusCode).toBe(200); expect(saved.json()).toEqual({ ownerId: a.id, value: { text: "Private solo reflection", revision: 1 } });
    expect((await f.request(a, "PUT", "/api/discovery/reflection", { text: "Stale", revision: 0 })).statusCode).toBe(409);
    expect((await f.request(b, "GET", "/api/discovery/reflection")).json().value.text).toBe("");
    expect((await f.request(b, "GET", `/api/discovery/reflection?ownerId=${a.id}`)).statusCode).toBe(400);
    expect((await f.request(b, "PUT", "/api/discovery/reflection", { text: "Overwrite", revision: 1, ownerId: a.id })).statusCode).toBe(400);
    expect((await f.request(a, "PUT", "/api/discovery/reflection", { text: "x".repeat(4001), revision: 1 })).statusCode).toBe(400);
    expect(JSON.stringify((await f.request(a, "GET", "/api/discovery/profile")).json())).not.toContain("Private solo reflection");
    process.env.DISCOVERY_ENABLED = "false"; process.env.DISCOVERY_PILOT_USER_IDS = "";
    expect((await f.request(a, "GET", "/api/discovery/reflection")).json().value.text).toBe("Private solo reflection");
    expect((await f.request(a, "PUT", "/api/discovery/reflection", { text: "Still my private space", revision: 1 })).statusCode).toBe(200);
    expect(await prisma.intentionResponse.count({ where: { userId: a.id } })).toBe(0);
    f.configure();
  });
});
