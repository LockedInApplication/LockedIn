import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
vi.mock("../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => { } }));
describe.skipIf(process.env.NOTIFICATIONS_INTEGRATION !== "true")("invitation boundaries and private sender status", () => {
    let prisma: typeof import("../../lib/prisma.js").prisma;
    let server: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
    type Person = {
        id: string;
        email: string;
        cookie: string;
    };
    let a: Person, b: Person, c: Person;
    async function person(): Promise<Person> { const id = randomUUID(), token = randomUUID(); const email = `${id}@example.test`; await prisma.user.create({ data: { id, email, name: "Test account", emailVerified: true } }); await prisma.session.create({ data: { id: randomUUID(), userId: id, token, expiresAt: new Date(Date.now() + 3600000) } }); return { id, email, cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64")}`)}` }; }
    beforeAll(async () => { ({ prisma } = await import("../../lib/prisma.js")); const { buildServer } = await import("../../app.js"); server = await buildServer(); });
    afterAll(async () => { await server?.close(); await prisma?.$disconnect(); });
    beforeEach(async () => { a = await person(); b = await person(); c = await person(); });
    const request = (who: Person, method: "GET" | "POST" | "DELETE", url: string, payload?: object) => server.inject({ method, url, headers: { cookie: who.cookie }, ...(payload ? { payload } : {}) });
    const send = (from = a, to = b) => request(from, "POST", "/api/journey/invites", { email: to.email });
    async function invitation(from = a, to = b) { const result = await send(from, to); expect(result.statusCode).toBe(201); return prisma.relationshipInvite.findUniqueOrThrow({ where: { token: result.json().token } }); }
    const decline = (token: string, who = b) => request(who, "POST", `/api/journey/invites/${token}/decline`);
    const block = (token: string, who = b) => request(who, "POST", `/api/journey/invites/${token}/block`);
    const blocks = (who = b) => request(who, "GET", "/api/journey/invitation-blocks");
    const sent = (who = a) => request(who, "GET", "/api/journey/invites/sent");
    it("shows sender-only neutral statuses and withdraws pending links", async () => {
        const invite = await invitation();
        const list = await sent();
        expect(list.statusCode).toBe(200);
        expect(list.json().items[0].status).toBe("PENDING");
        expect((await sent(c)).json().items).toEqual([]);
        expect((await request(c, "POST", `/api/journey/invites/${invite.id}/withdraw`)).statusCode).toBe(404);
        expect((await request(a, "POST", `/api/journey/invites/${invite.id}/withdraw`)).statusCode).toBe(200);
        expect((await sent()).json().items[0].status).toBe("WITHDRAWN");
        expect((await request(b, "POST", `/api/journey/invites/${invite.token}/accept`)).statusCode).toBe(409);
    });
    it("decline pauses A-to-B only, never extends on retry, and creates no alert for A", async () => {
        const invite = await invitation();
        await decline(invite.token);
        const first = await prisma.relationshipInvite.findUniqueOrThrow({ where: { id: invite.id } });
        expect(first.declinedAt).toBeTruthy();
        expect((await send()).statusCode).toBe(409);
        expect((await decline(invite.token)).statusCode).toBe(409);
        expect((await prisma.relationshipInvite.findUniqueOrThrow({ where: { id: invite.id } })).declinedAt).toEqual(first.declinedAt);
        expect((await sent()).json().items[0].status).toBe("NOT_ACCEPTED");
        expect(await prisma.notification.count({ where: { recipientId: a.id } })).toBe(0);
        expect((await send(b, a)).statusCode).toBe(201);
        await prisma.relationshipInvite.update({ where: { id: invite.id }, data: { declinedAt: new Date(Date.now() - 7 * 86400000 - 1) } });
        expect((await send()).statusCode).toBe(201);
    });
    it("expiry has no decline pause and withdrawal cannot erase one", async () => {
        const expired = await invitation();
        await prisma.relationshipInvite.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
        expect((await sent()).json().items[0].status).toBe("EXPIRED");
        const next = await invitation();
        await decline(next.token);
        expect((await request(a, "POST", `/api/journey/invites/${next.id}/withdraw`)).statusCode).toBe(409);
        expect((await send()).statusCode).toBe(409);
    });
    it("a private block closes both directions and never discloses itself to the sender", async () => {
        const original = await invitation();
        const reverse = await invitation(b, a);
        expect((await block(original.token)).statusCode).toBe(200);
        expect((await send()).statusCode).toBe(409);
        expect((await send(b, a)).statusCode).toBe(409);
        expect((await request(a, "POST", `/api/journey/invites/${reverse.token}/accept`)).statusCode).toBe(409);
        const body = (await sent()).json();
        expect(body.items[0].status).toBe("NOT_ACCEPTED");
        expect(JSON.stringify(body)).not.toMatch(/block|inviteeId|declinedAt|token/i);
        expect(JSON.stringify((await send()).json())).not.toMatch(/block|account exists/i);
        expect((await blocks(a)).json().items).toEqual([]);
        expect(await prisma.notification.count({ where: { recipientId: a.id } })).toBe(1); // reverse invitation only
        expect(await prisma.relationship.count({ where: { members: { some: { userId: a.id } } } })).toBe(0);
    });
    it("only the blocker can unblock; doing so restores nothing and keeps a prior pause", async () => {
        const invite = await invitation();
        await decline(invite.token);
        await block(invite.token);
        const own = (await blocks()).json().items[0];
        expect(own.id).toBeTruthy();
        expect((await request(a, "DELETE", `/api/journey/invitation-blocks/${own.id}`)).statusCode).toBe(404);
        expect((await request(b, "DELETE", `/api/journey/invitation-blocks/${own.id}`)).statusCode).toBe(200);
        expect((await send()).statusCode).toBe(409);
        expect((await sent()).json().items[0].status).toBe("NOT_ACCEPTED");
        expect((await send(b, a)).statusCode).toBe(201);
    });
    it("two independently created blocks remain independent", async () => {
        const original = await invitation();
        const reverse = await invitation(b, a);
        await block(original.token, b);
        await block(reverse.token, a);
        const own = (await blocks(b)).json().items[0];
        expect((await request(b, "DELETE", `/api/journey/invitation-blocks/${own.id}`)).statusCode).toBe(200);
        expect((await send()).statusCode).toBe(409);
        expect((await send(b, a)).statusCode).toBe(409);
        expect((await blocks(a)).json().items).toHaveLength(1);
    });
    it("concurrent block and resend leave no outstanding invitation", async () => {
        const original = await invitation();
        await Promise.all([block(original.token), send()]);
        expect(await prisma.relationshipInvite.count({ where: { status: "PENDING", OR: [{ inviterId: a.id, inviteeId: b.id }, { inviterId: b.id, inviteeId: a.id }] } })).toBe(0);
    });
    it("concurrent decline and resend cannot leave a pending retry",async()=>{
        const original=await invitation();await Promise.all([decline(original.token),send()]);
        expect(await prisma.relationshipInvite.count({where:{inviterId:a.id,inviteeId:b.id,status:"PENDING"}})).toBe(0);
        expect((await send()).statusCode).toBe(409);
    });
    it("withdraw and acceptance serialize without an inconsistent shared space",async()=>{
        const original=await invitation();
        await Promise.all([request(a,"POST",`/api/journey/invites/${original.id}/withdraw`),request(b,"POST",`/api/journey/invites/${original.token}/accept`)]);
        const final=await prisma.relationshipInvite.findUniqueOrThrow({where:{id:original.id}});
        expect(["ACCEPTED","CANCELED"]).toContain(final.status);
        expect(await prisma.relationship.count({where:{members:{some:{userId:a.id}}}})).toBe(final.status==="ACCEPTED"?1:0);
    });
    it("blocking cannot silently end a space even when acceptance wins a race",async()=>{
        const original=await invitation();
        await Promise.all([block(original.token),request(b,"POST",`/api/journey/invites/${original.token}/accept`)]);
        const final=await prisma.relationshipInvite.findUniqueOrThrow({where:{id:original.id}});
        expect(await prisma.relationship.count({where:{status:"ACTIVE",members:{some:{userId:a.id}}}})).toBe(final.status==="ACCEPTED"?1:0);
        expect((await send()).statusCode).toBe(409);
    });
    it("restricts block creation and paginated management to the proper owner",async()=>{
        const original=await invitation();expect((await block(original.token,c)).statusCode).toBe(404);
        await block(original.token);const own=(await blocks()).json().items[0];
        expect((await request(a,"GET",`/api/journey/invitation-blocks?before=${own.id}`)).statusCode).toBe(400);
        expect((await request(c,"GET",`/api/journey/invites/sent?before=${original.id}`)).statusCode).toBe(400);
    });
    it("uses a discovery-safe block label without exposing the private account name",async()=>{
        await prisma.user.update({where:{id:a.id},data:{name:"Private legal name",displayName:"Private settings name"}});
        await prisma.invitationBlock.create({data:{blockerId:b.id,blockedId:a.id,safePublicLabel:"Chosen public alias"}});
        const result=await blocks(b);expect(result.statusCode).toBe(200);
        expect(result.json().items[0].name).toBe("Chosen public alias");
        expect(JSON.stringify(result.json())).not.toMatch(/Private legal name|Private settings name/);
        expect((await blocks(a)).json().items).toEqual([]);
    });
});
