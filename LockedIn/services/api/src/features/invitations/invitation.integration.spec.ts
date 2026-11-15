import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
vi.mock("../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => { } }));
describe.skipIf(process.env.NOTIFICATIONS_INTEGRATION !== "true")("pre-connection invitation notifications", () => {
    let prisma: typeof import("../../lib/prisma.js").prisma;
    let server: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
    let base: string;
    type Person = {
        id: string;
        email: string;
        cookie: string;
    };
    let a: Person, b: Person, c: Person;
    async function person(email?: string): Promise<Person> {
        const id = randomUUID();
        const token = randomUUID();
        const address = email ?? `${id}@example.test`;
        await prisma.user.create({ data: { id, email: address, name: "Test inviter", emailVerified: true } });
        await prisma.session.create({ data: { id: randomUUID(), token, userId: id, expiresAt: new Date(Date.now() + 3600000) } });
        return { id, email: address, cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64")}`)}` };
    }
    beforeAll(async () => { ({ prisma } = await import("../../lib/prisma.js")); const { buildServer } = await import("../../app.js"); server = await buildServer(); base = await server.listen({ port: 0, host: "127.0.0.1" }); });
    afterAll(async () => { await server?.close(); await prisma?.$disconnect(); });
    beforeEach(async () => { a = await person(); b = await person(); c = await person(); });
    const send = (email = b.email) => server.inject({ method: "POST", url: "/api/journey/invites", headers: { cookie: a.cookie }, payload: { email } });
    const inbox = (who: Person) => server.inject({ url: "/api/journey/notifications", headers: { cookie: who.cookie } });
    async function invite() { const sent = await send(); expect(sent.statusCode).toBe(201); return prisma.relationshipInvite.findFirstOrThrow({ where: { inviterId: a.id } }); }
    it("saves one recipient notification and delivers SSE before a relationship exists", async () => {
        const abort = new AbortController();
        try {
            const response = await fetch(`${base}/api/journey/notifications/stream`, { headers: { cookie: b.cookie }, signal: abort.signal });
            const reader = response.body!.getReader();
            await reader.read();
            const received = await invite();
            const data = (await inbox(b)).json();
            expect(data.unreadCount).toBe(1);
            expect(data.items[0].kind).toBe("INVITATION_RECEIVED");
            expect(data.items[0].entityId).toBe(received.id);
            expect(JSON.stringify(data)).not.toContain(received.token);
            expect(await prisma.relationship.count({ where: { members: { some: { userId: b.id } } } })).toBe(0);
            const next = await Promise.race([reader.read(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("No invite SSE")), 3000).unref())]);
            expect(new TextDecoder().decode(next.value)).toContain("notifications-changed");
        }
        finally {
            abort.abort();
        }
    });
    it("reuses a pending invite and notification during concurrent resends", async () => {
        const results = await Promise.all([send(), send()]);
        expect(results[0]!.json().token).toBe(results[1]!.json().token);
        expect(await prisma.relationshipInvite.count({ where: { inviterId: a.id } })).toBe(1);
        expect((await inbox(b)).json().items).toHaveLength(1);
    });
    it("discovers a pending invite once when someone registers later", async () => {
        const email = `late-${randomUUID()}@example.test`;
        expect((await send(email)).statusCode).toBe(201);
        const late = await person(email);
        for (let i = 0; i < 2; i++) {
            const data = (await inbox(late)).json();
            expect(data.unreadCount).toBe(1);
            expect(data.items).toHaveLength(1);
        }
    });
    it("reviews without accepting and hides ID/token review from other accounts", async () => {
        const invitation = await invite();
        const byId = `/api/journey/invites/${invitation.id}/review?by=id`;
        const response = await server.inject({ url: byId, headers: { cookie: b.cookie } });
        expect(response.statusCode).toBe(200);
        expect(response.json().canRespond).toBe(true);
        for (const who of [a, c])
            for (const url of [byId, `/api/journey/invites/${invitation.token}/review`])
                expect((await server.inject({ url, headers: { cookie: who.cookie } })).statusCode).toBe(404);
        expect(await prisma.relationship.count({ where: { members: { some: { userId: b.id } } } })).toBe(0);
        expect((await prisma.relationshipInvite.findUniqueOrThrow({ where: { id: invitation.id } })).status).toBe("PENDING");
    });
    it("declines explicitly and clears the recipient unread count", async () => {
        const invitation = await invite();
        expect((await server.inject({ method: "POST", url: `/api/journey/invites/${invitation.token}/decline`, headers: { cookie: c.cookie } })).statusCode).toBe(404);
        expect((await server.inject({ method: "POST", url: `/api/journey/invites/${invitation.token}/decline`, headers: { cookie: b.cookie } })).statusCode).toBe(200);
        const data = (await inbox(b)).json();
        expect(data.unreadCount).toBe(0);
        expect(data.items[0].invitationStatus).toBe("DECLINED");
        expect(data.items[0].resolvedAt).toBeTruthy();
        expect(await prisma.relationship.count({ where: { members: { some: { userId: b.id } } } })).toBe(0);
    });
    it("labels expired invitations and excludes them from unread without a background job", async () => {
        const invitation = await invite();
        await prisma.relationshipInvite.update({ where: { id: invitation.id }, data: { expiresAt: new Date(0) } });
        const data = (await inbox(b)).json();
        expect(data.unreadCount).toBe(0);
        expect(data.items[0].invitationStatus).toBe("EXPIRED");
        const review = await server.inject({ url: `/api/journey/invites/${invitation.id}/review?by=id`, headers: { cookie: b.cookie } });
        expect(review.json().canRespond).toBe(false);
    });
    it("accepts once under concurrent requests, resolves B's invitation, and notifies A", async () => {
        const invitation = await invite();
        const accept = () => server.inject({ method: "POST", url: `/api/journey/invites/${invitation.token}/accept`, headers: { cookie: b.cookie } });
        const results = await Promise.all([accept(), accept()]);
        expect(results.map(r => r.statusCode).sort()).toEqual([201, 409]);
        expect(await prisma.relationship.count({ where: { members: { some: { userId: b.id } } } })).toBe(1);
        expect((await inbox(b)).json().unreadCount).toBe(0);
        expect((await inbox(a)).json().items.some((n: {
            kind: string;
        }) => n.kind === "INVITATION_ACCEPTED")).toBe(true);
    });
});
