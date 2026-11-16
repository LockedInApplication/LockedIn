import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson, discoveryRequest } from "../../test/discovery.fixtures.js";
import type { PhotoProvider } from "../photo.types.js";

vi.mock("../../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));
const draft = { publicName: "Photo alias", avatarPreset: "sun", bio: "Photo profile", intention: "LONG_TERM", interests: ["Walking"], pace: null, areaId: "pilot-city" };
type Person = Awaited<ReturnType<typeof createPerson>>;
describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("private photo lifecycle through real multipart and PostgreSQL", () => {
  let server: Awaited<ReturnType<typeof import("../../../../app.js").buildServer>>;
  let request: ReturnType<typeof discoveryRequest>; let jpeg: Buffer;
  const oldEnv = { ...process.env }; const uploads: Parameters<PhotoProvider["upload"]>[0][] = [];
  let hook: PhotoProvider["upload"] | undefined;
  let readHook: PhotoProvider["read"] | undefined;
  const provider: PhotoProvider = {
    upload: async input => { uploads.push(input); return hook ? hook(input) : { asset: { assetId: `synthetic-${input.photoId}`, publicId: `lockedin-discovery/${input.photoId}`, version: 1, format: "jpg" }, screening: { moderation: [{ kind: "aws_rek", status: "approved", response: { moderation_labels: [] } }] } }; },
    inspect: async () => null, read: async asset => readHook ? readHook(asset) : jpeg, destroy: async () => {}, override: async () => {},
  };
  beforeAll(async () => {
    Object.assign(process.env, { DISCOVERY_ENABLED: "true", DISCOVERY_PILOT_USER_IDS: "", DISCOVERY_MODERATOR_USER_IDS: "synthetic-moderator", DISCOVERY_AREAS_JSON: '[{"id":"pilot-city","label":"Pilot city"}]', DISCOVERY_PHOTOS_ENABLED: "true", CLOUDINARY_CLOUD_NAME: "synthetic", CLOUDINARY_API_KEY: "synthetic-key", CLOUDINARY_API_SECRET: "synthetic-secret" });
    server = await (await import("../../../../app.js")).buildServer({ photoProvider: provider });
    await server.listen({ port: 0, host: "127.0.0.1" }); request = discoveryRequest(server);
    jpeg = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#74a989" } }).jpeg().toBuffer();
  });
  afterAll(async () => { process.env = oldEnv; await server?.close(); await (await import("../../../../lib/prisma.js")).prisma.$disconnect(); });
  async function person() {
    const owner = await createPerson(); process.env.DISCOVERY_PILOT_USER_IDS += `,${owner.id}`;
    expect((await request(owner, "PUT", "/api/discovery/profile", { ...draft, revision: 0 })).statusCode).toBe(200); return owner;
  }
  async function upload(owner: Person, revision = 1, requestId = randomUUID(), extra: Record<string, string> = {}, bytes = jpeg, headers = {}, secondFile = false) {
    const form = new FormData(); form.append("requestId", requestId); form.append("draftRevision", String(revision));
    for (const [key, value] of Object.entries(extra)) form.append(key, value);
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), "client-name-must-not-persist.jpg");
    if (secondFile) form.append("file", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "second.jpg");
    const address = server.server.address(); if (!address || typeof address === "string") throw new Error();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/discovery/photos`, { method: "POST", headers: { cookie: owner.cookie, origin: "http://localhost:3001", "x-discovery-owner": owner.id, ...headers }, body: form });
    return { statusCode: response.status, json: await response.json() as any };
  }
  async function own(owner: Person) { return (await request(owner, "GET", "/api/discovery/profile")).json().value; }
  async function remove(owner: Person, id: string, revision: number, requestId = randomUUID()) { return request(owner, "DELETE", `/api/discovery/photos/${id}`, { requestId, draftRevision: revision }); }

  it("uploads only into a revisioned private draft; replay is one logical upload bound to exact payload", async () => {
    const a = await person(); const id = randomUUID(); const count = uploads.length;
    const first = await upload(a, 1, id);
    expect(first.statusCode).toBe(200); expect(first.json).toMatchObject({ ownerId: a.id, value: { photoId: expect.any(String), profile: { revision: 2, published: null, draft: { photoIds: [expect.any(String)] } } } });
    expect(uploads.length).toBe(count + 1); expect(uploads.at(-1)!.jpeg).not.toEqual(Buffer.alloc(1));
    const replay = await upload(a, 1, id); expect(replay.statusCode).toBe(200); expect(replay.json.value.photoId).toBe(first.json.value.photoId); expect(uploads.length).toBe(count + 1);
    expect((await upload(a, 2, id)).statusCode).toBe(409);
    expect((await upload(a, 1, id, {}, Buffer.concat([jpeg, Buffer.from("changed")]))).statusCode).toBe(409);
    const list = await request(a, "GET", "/api/discovery/photos"); expect(list.json().value.items[0]).toMatchObject({ id: first.json.value.photoId, state: "APPROVED", reason: "Ready to publish" });
    expect(JSON.stringify(list.json())).not.toMatch(/publicId|assetId|cloudinary|client-name|moderation_labels/);
    expect((await request(a, "POST", "/api/discovery/profile/publish", { draftRevision: 2, adultAttested: true })).statusCode).toBe(200);
  });
  it("checks identity/origin before multipart consumption and bounds fields, count, bytes and decoded input", async () => {
    const a = await person(); const count = uploads.length;
    expect((await upload(a, 1, randomUUID(), {}, jpeg, { origin: "https://attacker.invalid" })).statusCode).toBe(403);
    expect((await upload(a, 1, randomUUID(), {}, jpeg, { "x-discovery-owner": "wrong-account" })).statusCode).toBe(409);
    expect((await upload(a, 1, randomUUID(), { publicId: "forbidden" })).statusCode).toBe(400);
    expect((await upload(a, 1, randomUUID(), {}, jpeg, {}, true)).statusCode).toBe(400);
    expect((await upload(a, 1, randomUUID(), {}, Buffer.alloc(5 * 1024 * 1024 + 1))).statusCode).toBe(413);
    expect((await upload(a, 1, randomUUID(), {}, Buffer.from("not an image"))).statusCode).toBe(400);
    expect(uploads.length).toBe(count);
  });
  it("enforces three slots and rejects stale saves and foreign or deleted references", async () => {
    const a = await person(); const b = await person(); const ids: string[] = [];
    for (let revision = 1; revision <= 3; revision++) { const result = await upload(a, revision); expect(result.statusCode).toBe(200); ids.push(result.json.value.photoId); }
    expect((await upload(a, 4)).statusCode).toBe(409); expect((await upload(a, 1)).statusCode).toBe(409);
    expect((await request(b, "PUT", "/api/discovery/profile", { ...draft, revision: 1, photoIds: [ids[0]] })).statusCode).toBe(400);
    const deleted = await remove(a, ids[0]!, 4); expect(deleted.statusCode).toBe(200);
    expect((await request(a, "PUT", "/api/discovery/profile", { ...draft, revision: 5, photoIds: [ids[0]] })).statusCode).toBe(400);
  });
  it("preserves photos for old-client saves and retains replaced publication until explicit Publish or Delete", async () => {
    const a = await person(); const first = await upload(a); const id = first.json.value.photoId;
    expect((await request(a, "POST", "/api/discovery/profile/publish", { draftRevision: 2, adultAttested: true })).statusCode).toBe(200);
    const oldSave = await request(a, "PUT", "/api/discovery/profile", { ...draft, bio: "New text", revision: 2 });
    expect(oldSave.json().value.draft.photoIds).toEqual([id]);
    const second = await upload(a, 3, randomUUID(), { replacePhotoId: id }); expect(second.statusCode).toBe(200);
    expect(second.json.value.profile.published.photoIds).toEqual([id]); expect(second.json.value.profile.draft.photoIds).toEqual([second.json.value.photoId]);
    expect((await request(a, "PUT", "/api/discovery/profile", { ...draft, revision: 4, photoIds: [] })).statusCode).toBe(200);
    expect((await own(a)).published.photoIds).toEqual([id]);
    const { prisma } = await import("../../../../lib/prisma.js");
    expect((await prisma.discoveryPhoto.findUniqueOrThrow({ where: { id: second.json.value.photoId } })).revokedAt).not.toBeNull();
    const requestId = randomUUID(); const deleted = await remove(a, id, 5, requestId); expect(deleted.statusCode).toBe(200);
    expect((await own(a)).published.photoIds ?? []).toEqual([]);
    expect((await remove(a, id, 5, requestId)).statusCode).toBe(200); expect((await remove(a, id, 6, requestId)).statusCode).toBe(409);
    expect(await prisma.discoveryPhotoJob.count({ where: { photoId: id, kind: "DESTROY" } })).toBe(1);
  });
  it("holds rejected/pending/failed checks and never silently publishes them", async () => {
    for (const status of ["rejected", "pending", "aborted"]) {
      const a = await person();
      hook = async input => ({ asset: { assetId: `synthetic-${input.photoId}`, publicId: `lockedin-discovery/${input.photoId}`, version: 1, format: "jpg" }, screening: { moderation: [{ kind: "aws_rek", status, response: { moderation_labels: status === "rejected" ? [{ name: "Explicit Nudity", parent_name: "", confidence: 99 }] : [] } }] } });
      const result = await upload(a); hook = undefined; expect(result.statusCode).toBe(200);
      expect((await request(a, "POST", "/api/discovery/profile/publish", { draftRevision: 2, adultAttested: true })).statusCode).toBe(409);
      const items = (await request(a, "GET", "/api/discovery/photos")).json().value.items;
      if (status === "rejected") { expect(items[0].state).toBe("REJECTED"); expect(items[0].src).toBeUndefined(); }
    }
  });
  it("bounds upload quotas independently of profile saves", async () => {
    const { prisma } = await import("../../../../lib/prisma.js");
    for (const [duration, count] of [[3_600_000, 10], [86_400_000, 20]]) {
      const a = await person(); const windowStart = new Date(Math.floor(Date.now() / duration!) * duration!);
      await prisma.discoveryThrottle.create({ data: { userId: a.id, action: `photo:${duration}`, windowStart, count: count! } });
      expect((await upload(a)).statusCode).toBe(429);
    }
  });
  it("permits one in-flight reservation and makes network calls without holding account locks", async () => {
    const a = await person(); let release!: () => void; let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }); const wait = new Promise<void>(resolve => { release = resolve; });
    hook = async input => { entered(); await wait; return { asset: { assetId: `synthetic-${input.photoId}`, publicId: `lockedin-discovery/${input.photoId}`, version: 1, format: "jpg" }, screening: {} }; };
    const first = upload(a); await started;
    try { expect((await upload(a)).statusCode).toBe(409); } finally { release(); hook = undefined; }
    expect((await first).statusCode).toBe(200);
  });
  it("records ambiguous upload outcomes for reconciliation without a second upload", async () => {
    const a = await person(); const requestId = randomUUID(); const count = uploads.length;
    hook = async () => { throw new Error("synthetic timeout with sensitive provider detail"); };
    const result = await upload(a, 1, requestId); hook = undefined;
    expect(result.statusCode).toBe(200); expect((await upload(a, 1, requestId)).statusCode).toBe(200); expect(uploads.length).toBe(count + 1);
    const item = (await request(a, "GET", "/api/discovery/photos")).json().value.items[0]; expect(item.state).toBe("CHECK_FAILED");
    const { prisma } = await import("../../../../lib/prisma.js");
    expect(await prisma.discoveryPhotoJob.count({ where: { photoId: item.id, kind: "RECONCILE", completedAt: null } })).toBe(1);
    expect(JSON.stringify(result.json)).not.toContain("sensitive provider");
    expect((await request(a, "POST", `/api/discovery/photos/${item.id}/retry`, { requestId: randomUUID(), decisionRevision: item.decisionRevision })).statusCode).toBe(200);
    expect(uploads.length).toBe(count + 1);
  });
  it("does not resurrect late assets after explicit Delete or account admission is revoked", async () => {
    for (const mode of ["delete", "revoked", "stale"]) {
      const a = await person(); let target = "";
      hook = async input => {
        target = input.photoId;
        if (mode === "delete") expect((await remove(a, target, 1)).statusCode).toBe(200);
        if (mode === "revoked") { const { prisma } = await import("../../../../lib/prisma.js"); await prisma.user.update({ where: { id: a.id }, data: { emailVerified: false } }); }
        if (mode === "stale") expect((await request(a, "PUT", "/api/discovery/profile", { ...draft, revision: 1, bio: "Concurrent text" })).statusCode).toBe(200);
        return { asset: { assetId: `synthetic-${input.photoId}`, publicId: `lockedin-discovery/${input.photoId}`, version: 1, format: "jpg" }, screening: { moderation: [{ kind: "aws_rek", status: "approved", response: { moderation_labels: [] } }] } };
      };
      const result = await upload(a); hook = undefined; expect([403, 409]).toContain(result.statusCode);
      expect((await own(a)).draft.photoIds ?? []).not.toContain(target);
      const { prisma } = await import("../../../../lib/prisma.js"); expect((await prisma.discoveryPhoto.findUniqueOrThrow({ where: { id: target } })).revokedAt).not.toBeNull();
      expect(await prisma.discoveryPhotoJob.count({ where: { photoId: target, kind: "DESTROY" } })).toBe(1);
    }
  });
  it("keeps owner listing and deletion working when both feature flags are off", async () => {
    const a = await person(); const result = await upload(a); process.env.DISCOVERY_PHOTOS_ENABLED = "false"; process.env.DISCOVERY_ENABLED = "false";
    try {
      expect((await request(a, "GET", "/api/discovery/photos")).statusCode).toBe(200);
      expect((await remove(a, result.json.value.photoId, 2)).statusCode).toBe(200);
      expect((await upload(a, 3)).statusCode).toBe(403);
    } finally { process.env.DISCOVERY_PHOTOS_ENABLED = "true"; process.env.DISCOVERY_ENABLED = "true"; }
  });
  it("does not let an already approved draft bypass the photo rollout switch", async () => {
    const a = await person(); const result = await upload(a);
    expect(result.statusCode).toBe(200);
    process.env.DISCOVERY_PHOTOS_ENABLED = "false";
    try {
      expect((await request(a, "POST", "/api/discovery/profile/publish", { draftRevision: 2, adultAttested: true })).statusCode).toBe(409);
      expect((await own(a)).published).toBeNull();
      expect((await request(a, "PUT", "/api/discovery/profile", { ...draft, revision: 2, photoIds: [] })).statusCode).toBe(200);
      expect((await request(a, "POST", "/api/discovery/profile/publish", { draftRevision: 3, adultAttested: true })).statusCode).toBe(200);
    } finally { process.env.DISCOVERY_PHOTOS_ENABLED = "true"; }
  });
  it("serves peer images only from live publications and rechecks visibility after fetching bytes", async () => {
    const a = await person(); const b = await person();
    const result = await upload(a); const id = result.json.value.photoId;
    const media = `/api/discovery/photos/${id}/media`;
    expect((await request(a, "GET", media)).statusCode).toBe(200);
    await request(b, "POST", "/api/discovery/profile/publish", { draftRevision: 1, adultAttested: true });
    expect((await request(b, "GET", media)).statusCode).toBe(404);
    const published = await request(a, "POST", "/api/discovery/profile/publish", { draftRevision: 2, adultAttested: true });
    const detail = (await request(b, "GET", `/api/discovery/profiles/${published.json().value.published.id}`)).json().value;
    expect(detail.photos).toEqual([{ id, src: media, width: 120, height: 80 }]);
    const visible = await request(b, "GET", media); expect(visible.statusCode).toBe(200);
    expect(visible.headers).toMatchObject({ "content-type": "image/jpeg", "cache-control": "private, no-store", "x-content-type-options": "nosniff" });
    readHook = async () => { await request(a, "POST", "/api/discovery/profile/visibility", { paused: true }); return jpeg; };
    try { expect((await request(b, "GET", media)).statusCode).toBe(404); } finally { readHook = undefined; }
  });
  it("allows only an assigned verified moderator to review an appealed rejection, without publishing it", async () => {
    const owner = await person(), moderator = await createPerson(), unverified = await createPerson(false);
    process.env.DISCOVERY_MODERATOR_USER_IDS = `${moderator.id},${unverified.id}`;
    hook = async input => ({ asset: { assetId: input.photoId, publicId: `lockedin-discovery/${input.photoId}`, version: 1, format: "jpg" }, screening: { moderation: [{ kind: "aws_rek", status: "rejected", response: { moderation_labels: [{ name: "Explicit Nudity", parent_name: "", confidence: 99 }] } }] } });
    const result = await upload(owner); hook = undefined;
    const id = result.json.value.photoId, url = `/api/discovery/moderation/photos/${id}`;
    expect((await request(owner, "GET", `/api/discovery/photos/${id}/media`)).statusCode).toBe(404);
    expect((await request(moderator, "GET", `${url}/media`)).statusCode).toBe(404);
    const item = (await request(owner, "GET", "/api/discovery/photos")).json().value.items[0];
    const appeal = { requestId: randomUUID(), decisionRevision: item.decisionRevision };
    const appealUrl = `/api/discovery/photos/${id}/appeal`;
    expect((await request(owner, "POST", appealUrl, appeal)).statusCode).toBe(200);
    expect((await request(owner, "POST", appealUrl, appeal)).statusCode).toBe(200);
    expect((await request(owner, "POST", appealUrl, { ...appeal, requestId: randomUUID() })).statusCode).toBe(409);
    expect((await request(moderator, "GET", `${url}/media`)).statusCode).toBe(200);
    expect((await request(unverified, "GET", "/api/discovery/moderation/photos")).statusCode).toBe(403);
    const queue = (await request(moderator, "GET", "/api/discovery/moderation/photos")).json().value.items;
    const queued = queue.find((photo: { id: string }) => photo.id === id);
    expect(queued).toMatchObject({ id, state: "REJECTED" });
    const review = { action: "APPROVE", reason: "Synthetic false positive", requestId: randomUUID(), decisionRevision: queued.decisionRevision };
    expect((await request(owner, "POST", `${url}/review`, review)).statusCode).toBe(403);
    expect((await request(moderator, "POST", `${url}/review`, review)).statusCode).toBe(200);
    expect((await request(moderator, "POST", `${url}/review`, review)).statusCode).toBe(200);
    expect((await own(owner)).published).toBeNull();
    expect((await request(owner, "GET", "/api/discovery/photos")).json().value.items[0].state).toBe("APPROVED");
  });
  it("retains withdrawn report evidence until thirty days after the last resolution and then redacts its asset pointers", async () => {
    const a = await person(), b = await person(), c = await person(), moderator = await createPerson();
    process.env.DISCOVERY_MODERATOR_USER_IDS = moderator.id;
    const id = (await upload(a)).json.value.photoId;
    const report = (person: Person) => request(person, "POST", "/api/discovery/reports", { sourceType: "PHOTO", sourceId: id, reason: "OTHER", requestId: randomUUID() });
    for (const owner of [b, c]) expect((await request(owner, "POST", "/api/discovery/profile/publish", { draftRevision: 1, adultAttested: true })).statusCode).toBe(200);
    expect((await report(b)).statusCode).toBe(404);
    expect((await request(a, "POST", "/api/discovery/profile/publish", { draftRevision: 2, adultAttested: true })).statusCode).toBe(200);
    const first = await report(b), second = await report(c);
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect((await remove(a, id, 2)).statusCode).toBe(200);
    const media = `/api/discovery/moderation/photos/${id}/media`;
    expect((await request(b, "GET", media)).statusCode).toBe(404);
    expect((await request(moderator, "GET", media)).statusCode).toBe(200);
    const { prisma } = await import("../../../../lib/prisma.js");
    const { runPhotoJobs } = await import("../photo-jobs.service.js");
    const destroy = vi.fn(provider.destroy), scoped = { ...provider, destroy };
    const from = new Date(), day = 86_400_000;
    const jobs = { photoId: id, kind: "DESTROY" as const };
    await prisma.discoveryPhotoJob.updateMany({ where: jobs, data: { dueAt: from } });
    await runPhotoJobs({ provider: scoped, now: from, batchSize: 50 });
    expect(destroy.mock.calls.some(([asset]) => asset.publicId.endsWith(id))).toBe(false);
    await prisma.discoveryReport.update({ where: { id: first.json().value.id }, data: { resolvedAt: new Date(+from - 31 * day) } });
    await prisma.discoveryReport.update({ where: { id: second.json().value.id }, data: { resolvedAt: new Date(+from - 29 * day) } });
    await prisma.discoveryPhotoJob.updateMany({ where: jobs, data: { dueAt: from } });
    await runPhotoJobs({ provider: scoped, now: from, batchSize: 50 });
    expect(destroy.mock.calls.some(([asset]) => asset.publicId.endsWith(id))).toBe(false);
    const eligible = new Date(+from + day);
    await prisma.discoveryPhotoJob.updateMany({ where: jobs, data: { leaseToken: "expired", leaseUntil: new Date(+eligible - 1), dueAt: eligible } });
    await Promise.all([runPhotoJobs({ provider: scoped, now: eligible, batchSize: 50 }), runPhotoJobs({ provider: scoped, now: eligible, batchSize: 50 })]);
    expect(destroy.mock.calls.filter(([asset]) => asset.publicId.endsWith(id))).toHaveLength(1);
    expect(await prisma.discoveryPhoto.findUniqueOrThrow({ where: { id } })).toMatchObject({ assetId: null, publicId: null, assetVersion: null, destroyedAt: eligible });
    expect(await prisma.discoveryPhotoAudit.count({ where: { photoId: id, action: "DELETE" } })).toBe(1);
    expect((await request(moderator, "GET", media)).statusCode).toBe(404);
  });
  it("fences stale reconciliations and lets an explicit retry inspect a retained asset after the original deadline", async () => {
    const a = await person(); hook = async () => { throw new Error("Synthetic timeout"); };
    const response = await upload(a); hook = undefined;
    expect(response.statusCode).toBe(200);
    const id = response.json.value.photoId;
    const { prisma } = await import("../../../../lib/prisma.js");
    const { finalizePhotoUpload } = await import("../photo-lifecycle.service.js");
    const { runPhotoJobs } = await import("../photo-jobs.service.js");
    const row = await prisma.discoveryPhoto.update({ where: { id }, data: { createdAt: new Date(Date.now() - 2 * 86_400_000) } });
    const job = await prisma.discoveryPhotoJob.findFirstOrThrow({ where: { photoId: id, kind: "RECONCILE" } });
    const completed = { asset: { assetId: "late-synthetic", publicId: row.publicId!, version: 1, format: "jpg" as const }, screening: { moderation: [{ kind: "aws_rek", status: "approved", response: { moderation_labels: [] } }] } };
    expect(await finalizePhotoUpload(a.id, id, completed, { id: job.id, token: "stale-worker", clock: () => new Date() })).toMatchObject({ ok: false });
    expect((await request(a, "POST", `/api/discovery/photos/${id}/retry`, { requestId: randomUUID(), decisionRevision: row.decisionRevision })).statusCode).toBe(200);
    await runPhotoJobs({ provider: { ...provider, inspect: async ({ publicId }) => publicId === row.publicId ? completed : null }, batchSize: 50 });
    expect(await prisma.discoveryPhoto.findUniqueOrThrow({ where: { id } })).toMatchObject({ state: "APPROVED", assetId: "late-synthetic" });
    expect((await own(a)).published).toBeNull();
  });
  it("keeps an ambiguous upload key after provider not-found so late private bytes can still be destroyed", async () => {
    const a = await person(); hook = async () => { throw new Error("Synthetic timeout"); };
    const response = await upload(a); hook = undefined;
    const id = response.json.value.photoId;
    expect((await remove(a, id, 2)).statusCode).toBe(200);
    const { prisma } = await import("../../../../lib/prisma.js");
    const { runPhotoJobs } = await import("../photo-jobs.service.js");
    const now = new Date();
    await prisma.discoveryPhotoJob.updateMany({ where: { photoId: id, kind: "DESTROY" }, data: { dueAt: now } });
    await runPhotoJobs({ provider: { ...provider, destroy: async () => "missing" }, now, batchSize: 50 });
    expect(await prisma.discoveryPhoto.findUniqueOrThrow({ where: { id } })).toMatchObject({ destroyedAt: null, publicId: `lockedin-discovery/${id}` });
    const later = new Date(+now + 86_400_000);
    await runPhotoJobs({ provider: { ...provider, destroy: async () => "destroyed" }, now: later, batchSize: 50 });
    expect(await prisma.discoveryPhoto.findUniqueOrThrow({ where: { id } })).toMatchObject({ destroyedAt: later, publicId: null });
  });
});
