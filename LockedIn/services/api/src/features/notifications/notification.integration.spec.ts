import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
type Inbox=Awaited<ReturnType<typeof import("./notification.repository.js").listNotifications>>;
vi.mock("../journey-notifications/journey-email.service.js",()=>({sendJourneyEmailSafely:async()=>{}}));
describe.skipIf(process.env.NOTIFICATIONS_INTEGRATION !== "true")("notification database and HTTP integration", () => {
    let prisma: typeof import("../../lib/prisma.js").prisma;
    let server: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
    let service: typeof import("./notification.service.js");
    let base: string, pair: string, cookieA: string, cookieB: string, chapterId: string;
    beforeAll(async () => {
        ({ prisma } = await import("../../lib/prisma.js"));
        service = await import("./notification.service.js");
        const { buildServer } = await import("../../app.js");
        server = await buildServer();
        base = await server.listen({ port: 0, host: "127.0.0.1" });
        for (const id of ["notify-a", "notify-b", "notify-c"]) {
            await prisma.user.create({ data: { id, email: `${id}@example.test`, name: id, emailVerified: true } });
            await prisma.session.create({ data: { id: `session-${id}`, userId: id, token: `token-${id}`, expiresAt: new Date(Date.now() + 3600000) } });
        }
        const cookie = (id: string) => { const token = `token-${id}`; return `better-auth.session_token=${encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64")}`)}`; };
        cookieA = cookie("notify-a");
        cookieB = cookie("notify-b");
        pair = (await prisma.relationship.create({ data: { members: { create: [{ userId: "notify-a" }, { userId: "notify-b" }] } } })).id;
    });
    afterAll(async () => { await server?.close(); await prisma?.$disconnect(); });
    it("rolls back domain state and notifications together", async () => {
        await expect(service.withNotifications(pair, "notify-a", async (tx) => { await tx.meaningChapter.create({ data: { relationshipId: pair, createdById: "notify-a", wordKey: "space" } }); throw new Error("rollback"); })).rejects.toThrow("rollback");
        expect(await prisma.meaningChapter.count()).toBe(0);
        expect(await prisma.notification.count()).toBe(0);
    });
    it("creates durable tasks atomically and suppresses no-op duplicates", async () => {
        chapterId = (await service.withNotifications(pair, "notify-a", tx => tx.meaningChapter.create({ data: { relationshipId: pair, createdById: "notify-a", wordKey: "support" } }))).id;
        expect(await prisma.notification.count()).toBe(2);
        await service.withNotifications(pair, "notify-a", async () => ({ saved: true }));
        expect(await prisma.notification.count()).toBe(2);
    });
    it("lists only the current recipient and hides another person's IDs", async () => {
        const response = await fetch(`${base}/api/journey/notifications`, { headers: { cookie: cookieA } });
        expect(response.status).toBe(200);
        const inbox = await response.json() as Inbox;
        expect(inbox.unreadCount).toBe(1);
        const other = await prisma.notification.findFirstOrThrow({ where: { recipientId: "notify-b" } });
        expect((await fetch(`${base}/api/journey/notifications/${other.id}/read`, { method: "PUT", headers: { cookie: cookieA } })).status).toBe(404);
        const id = inbox.items[0]!.id;
        for (let i = 0; i < 2; i++)
            expect((await fetch(`${base}/api/journey/notifications/${id}/read`, { method: "PUT", headers: { cookie: cookieA } })).status).toBe(200);
        expect((await (await fetch(`${base}/api/journey/notifications`, { headers: { cookie: cookieA } })).json() as Inbox).unreadCount).toBe(0);
        expect(JSON.stringify(inbox)).not.toMatch(/recipientId|definition|heardSummary|proposalId|eventKey/);
    });
    it("delivers actual authenticated SSE and reconnect catchup without private answers", async () => {
        const abort = new AbortController();
        const response = await fetch(`${base}/api/journey/notifications/stream`, { headers: { cookie: cookieB }, signal: abort.signal });
        expect(response.headers.get("content-type")).toContain("text/event-stream");
        const reader = response.body!.getReader();
        const first = new TextDecoder().decode((await reader.read()).value);
        expect(first).toContain('"activity":false');
        await service.withNotifications(pair, "notify-a", tx => tx.meaningResponse.create({ data: { chapterId, userId: "notify-a", definition: "PRIVATE-DEFINITION", example: "PRIVATE-EXAMPLE", notMeaning: "PRIVATE-BOUNDARY" } }));
        const next = await Promise.race([reader.read(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SSE delivery timed out")), 3000).unref())]);
        const payload = new TextDecoder().decode(next.value);
        expect(payload).toContain("notifications-changed");
        expect(payload).not.toContain("PRIVATE");
        abort.abort();
        const inbox = await (await fetch(`${base}/api/journey/notifications`, { headers: { cookie: cookieB } })).json() as Inbox;
        expect(inbox.items.length).toBeGreaterThan(0);
        const reconnectAbort = new AbortController();
        const reconnect = await fetch(`${base}/api/journey/notifications/stream`, { headers: { cookie: cookieB }, signal: reconnectAbort.signal });
        expect(new TextDecoder().decode((await reconnect.body!.getReader().read()).value)).toContain('"activity":false');
        reconnectAbort.abort();
    });
    it("paginates an inbox without losing older unread items",async()=>{
        await prisma.notification.createMany({data:Array.from({length:35},(_,i)=>({recipientId:"notify-a",relationshipId:pair,kind:"STEP_PROPOSED",entityId:`test-step-${i}`,eventKey:`page-${i}`}))});
        const first=await(await fetch(`${base}/api/journey/notifications`,{headers:{cookie:cookieA}})).json() as Inbox;
        expect(first.items).toHaveLength(30);expect(first.unreadCount).toBe(35);expect(first.nextCursor).toBeTruthy();
        const next=await(await fetch(`${base}/api/journey/notifications?before=${first.nextCursor}`,{headers:{cookie:cookieA}})).json() as Inbox;
        expect(next.items).toHaveLength(6);expect(next.nextCursor).toBeNull();
        expect(new Set([...first.items,...next.items].map((item:{id:string})=>item.id)).size).toBe(36);
    });
    it("does not create duplicate steps or alerts for simultaneous identical proposals",async()=>{
        const r=await prisma.relationship.create({data:{members:{create:[{userId:"notify-a"},{userId:"notify-b"}]}}});
        const session=await prisma.intentionSession.create({data:{relationshipId:r.id,createdById:"notify-a",status:"REVEALED",responses:{create:["notify-a","notify-b"].map(userId=>({userId,answers:{},shareKeys:[],revealConsentedAt:new Date()}))}}});
        const submit=()=>server.inject({method:"POST",url:`/api/journey/sessions/${session.id}/next-steps`,headers:{cookie:cookieA},payload:{title:"Meet over coffee",details:"Take a little time together"}});
        const responses=await Promise.all([submit(),submit()]);
        expect(responses.map(r=>r.statusCode)).toEqual([201,201]);
        expect(responses[0]!.json().id).toBe(responses[1]!.json().id);
        expect(await prisma.sharedNextStep.count({where:{sessionId:session.id}})).toBe(1);
        expect(await prisma.notification.count({where:{relationshipId:r.id,kind:"STEP_PROPOSED"}})).toBe(1);
    });
    it("concurrent starts reuse one active chapter and one notification per person",async()=>{
        const r=await prisma.relationship.create({data:{members:{create:[{userId:"notify-a"},{userId:"notify-b"}]}}});
        const submit=()=>server.inject({method:"POST",url:`/api/journey/relationships/${r.id}/atlas/quality-time`,headers:{cookie:cookieA}});
        const responses=await Promise.all([submit(),submit()]);
        expect(responses[0]!.json().chapterId).toBe(responses[1]!.json().chapterId);
        expect(await prisma.meaningChapter.count({where:{relationshipId:r.id}})).toBe(1);
        expect(await prisma.notification.count({where:{relationshipId:r.id,kind:"CHAPTER_STARTED"}})).toBe(2);
    });
    it("a corrected heard summary gets a fresh unread alert without duplicating identical retries",async()=>{
        const r=await prisma.relationship.create({data:{members:{create:[{userId:"notify-a"},{userId:"notify-b"}]}}});
        const chapter=await prisma.meaningChapter.create({data:{relationshipId:r.id,createdById:"notify-a",wordKey:"support",status:"CHECKING",responses:{create:["notify-a","notify-b"].map(userId=>({userId,definition:"private meaning",example:"private moment",notMeaning:"private boundary"}))}},include:{responses:true}});
        const listener=chapter.responses.find(r=>r.userId==="notify-a")!;
        const heard=(summary:string)=>server.inject({method:"PUT",url:`/api/journey/atlas/${chapter.id}/heard`,headers:{cookie:cookieA},payload:{summary}});
        expect((await heard("I heard your original meaning")).statusCode).toBe(200);
        const original=await prisma.notification.findFirstOrThrow({where:{relationshipId:r.id,recipientId:"notify-b",kind:"HEARD_CHECK"}});
        expect((await server.inject({method:"PUT",url:`/api/journey/notifications/${original.id}/read`,headers:{cookie:cookieB}})).statusCode).toBe(200);
        expect((await server.inject({method:"POST",url:`/api/journey/atlas/${chapter.id}/heard/${listener.id}/confirm`,headers:{cookie:cookieB},payload:{status:"ALMOST"}})).statusCode).toBe(200);
        expect((await heard("I now understand your meaning differently")).statusCode).toBe(200);
        const renewed=await prisma.notification.findFirstOrThrow({where:{relationshipId:r.id,recipientId:"notify-b",kind:"HEARD_CHECK",resolvedAt:null},orderBy:{id:"desc"}});
        expect(renewed.id).toBeGreaterThan(original.id);expect(renewed.readAt).toBeNull();
        await heard("I now understand your meaning differently");
        expect(await prisma.notification.count({where:{relationshipId:r.id,recipientId:"notify-b",kind:"HEARD_CHECK"}})).toBe(2);
    });
    it("recovers another worker's persisted update and closes an expired session",async()=>{
        const abort=new AbortController();
        const response=await fetch(`${base}/api/journey/notifications/stream`,{headers:{cookie:cookieA},signal:abort.signal});
        const reader=response.body!.getReader();await reader.read();
        await prisma.notification.create({data:{recipientId:"notify-a",relationshipId:pair,kind:"STEP_PROPOSED",entityId:"cross-worker",eventKey:"cross-worker"}});
        const read=()=>Promise.race([reader.read(),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("stream timer timed out")),12000).unref())]);
        expect(new TextDecoder().decode((await read()).value)).toContain('"activity":true');
        await prisma.session.update({where:{token:"token-notify-a"},data:{expiresAt:new Date(0)}});
        expect(new TextDecoder().decode((await read()).value)).toContain("auth-expired");
        abort.abort();
    },25000);
    it("filters completed/superseded tasks out of unread and excludes ended spaces", async () => {
        await service.withNotifications(pair, "notify-b", async (tx) => {
            await tx.meaningResponse.create({ data: { chapterId, userId: "notify-b", definition: "PRIVATE", example: "PRIVATE", notMeaning: "PRIVATE" } });
            await tx.meaningChapter.update({ where: { id: chapterId }, data: { status: "DISCOVERING" } });
        });
        expect(await prisma.notification.count({ where: { kind: "CHAPTER_STARTED", resolvedAt: { not: null } } })).toBe(2);
        await service.withNotifications(pair, "notify-a", tx => tx.relationship.update({ where: { id: pair }, data: { status: "ENDED" } }));
        const inbox = await (await fetch(`${base}/api/journey/notifications`, { headers: { cookie: cookieB } })).json() as Inbox;
        const hidden=new Set((await prisma.notification.findMany({where:{relationshipId:pair},select:{id:true}})).map(n=>String(n.id)));
        expect(inbox.items.some(item=>hidden.has(item.id))).toBe(false);
        expect(inbox.unreadCount).toBe(3);
    });
});
