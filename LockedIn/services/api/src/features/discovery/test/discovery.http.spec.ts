import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson, discoveryRequest } from "./discovery.fixtures.js";

vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("discovery authenticated HTTP foundation", () => {
  let server: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  let a: Awaited<ReturnType<typeof createPerson>>, b: typeof a;
  let request: ReturnType<typeof discoveryRequest>;
  beforeAll(async () => {
    server = await (await import("../../../app.js")).buildServer();
    await server.listen({ port: 0, host: "127.0.0.1" });
    a = await createPerson(); b = await createPerson(); request = discoveryRequest(server);
  });
  afterAll(async () => { await server?.close(); await (await import("../../../lib/prisma.js")).prisma.$disconnect(); });
  it("returns owner-scoped capabilities with new entry disabled and no automatic publication", async () => {
    const response = await request(a, "GET", "/api/discovery/me");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ownerId: a.id, value: { canDiscover: false, canReflect: true, hasHistory: false, areas: [], topics: [] } });
    expect((await request(b, "GET", "/api/discovery/me")).json().ownerId).toBe(b.id);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    const { prisma } = await import("../../../lib/prisma.js");
    expect(await prisma.discoveryProfile.count({ where: { ownerId: { in: [a.id, b.id] } } })).toBe(0);
  });
  it("keeps anonymous requests unauthorized and private", async () => {
    const response = await server.inject({ method: "GET", url: "/api/discovery/me" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toHaveProperty("error");
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
});
