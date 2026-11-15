import Fastify from "fastify";
vi.mock("../invitations/invitation-notifications.service.js",()=>({ensureInvitationNotifications:async()=>{}}));
import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ user: { id: "a" } as {
        id: string;
    } | null, list: vi.fn(), read: vi.fn() }));
vi.mock("../../lib/session.js", () => ({ getAuthenticatedUser: async () => fake.user }));
vi.mock("./notification.repository.js", () => ({ listNotifications: (...args: unknown[]) => fake.list(...args), markNotificationRead: (...args: unknown[]) => fake.read(...args), notificationFingerprint: async () => "0" }));
import { registerNotificationRoutes } from "./notification.routes.js";
beforeEach(() => { vi.clearAllMocks(); fake.user = { id: "a" }; fake.list.mockResolvedValue({ items: [], unreadCount: 0, nextCursor: null }); fake.read.mockResolvedValue(false); });
describe("notification HTTP boundaries", () => {
    async function app() { const server = Fastify(); await registerNotificationRoutes(server); return server; }
    it("rejects logged-out inbox and stream requests", async () => { fake.user = null; const server = await app(); for (const path of ["", "/stream"])
        expect((await server.inject(`/api/journey/notifications${path}`)).statusCode).toBe(401); await server.close(); });
    it("serves a private inbox with bounded cursor validation", async () => { const server = await app(); const response = await server.inject("/api/journey/notifications"); expect(response.statusCode).toBe(200); expect(response.headers["cache-control"]).toContain("no-store"); expect(response.json()).toEqual({ items: [], unreadCount: 0, nextCursor: null }); expect((await server.inject("/api/journey/notifications?before=oops")).statusCode).toBe(400); await server.close(); });
    it("hides a notification that is not owned/eligible", async () => { const server = await app(); expect((await server.inject({ method: "PUT", url: "/api/journey/notifications/123/read" })).statusCode).toBe(404); await server.close(); });
    it("returns a successful idempotent read result and rejects malformed IDs", async () => { fake.read.mockResolvedValue(true); const server = await app(); expect((await server.inject({ method: "PUT", url: "/api/journey/notifications/123/read" })).json()).toEqual({ read: true }); expect((await server.inject({ method: "PUT", url: "/api/journey/notifications/-1/read" })).statusCode).toBe(400); await server.close(); });
});
