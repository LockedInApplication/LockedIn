import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPerson } from "../discovery/test/discovery.fixtures.js";
import type { PhotoProvider } from "../discovery/photos/photo.types.js";

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("automatic account photo cleanup", () => {
  const savedEnv = { ...process.env }, password = "disposable-cleanup-password", origin = "http://localhost:3001";
  const configured = { CLOUDINARY_CLOUD_NAME: "synthetic", CLOUDINARY_API_KEY: "test", CLOUDINARY_API_SECRET: "test" };
  let app: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
  let db: typeof import("../../lib/prisma.js").prisma;
  let run: typeof import("./account-photo-cleanup.js").runAccountPhotoCleanup;
  let hash: string;
  const destroy = vi.fn<PhotoProvider["destroy"]>();
  const fake: PhotoProvider = {
    destroy, inspect: async () => null, read: async () => { throw Error("Unexpected read"); },
    upload: async () => { throw Error("Unexpected upload"); }, override: async () => { throw Error("Unexpected override"); },
  };

  beforeAll(async () => {
    ({ prisma: db } = await import("../../lib/prisma.js"));
    const { auth } = await import("../../lib/auth.js");
    hash = await (await auth.$context).password.hash(password);
    ({ runAccountPhotoCleanup: run } = await import("./account-photo-cleanup.js"));
    app = await (await import("../../app.js")).buildServer();
  });
  beforeEach(() => {
    Object.assign(process.env, configured, { ACCOUNT_PHOTO_DELETION_ENABLED: "true" });
    destroy.mockReset().mockResolvedValue("destroyed");
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); process.env = savedEnv; });

  async function ownerWithPhoto({ history = false, unknown = false } = {}) {
    const owner = await createPerson();
    await db.account.create({ data: { id: randomUUID(), accountId: owner.id, userId: owner.id, providerId: "credential", password: hash } });
    const profile = await db.discoveryProfile.create({ data: { ownerId: owner.id, draft: { revision: 0 } } });
    const id = randomUUID();
    const photo = await db.discoveryPhoto.create({ data: {
      id, ownerId: owner.id, profileId: profile.id, payloadHash: "0".repeat(64), requestId: randomUUID(),
      ...(history ? { destroyedAt: new Date(), revokedAt: new Date() } : { publicId: `lockedin-discovery/${id}` }),
      ...(history || unknown ? {} : { assetId: `asset-${id}`, assetVersion: 1, state: "APPROVED", scanCompleted: true }),
    } });
    return { ...owner, photo };
  }
  type Owner = Awaited<ReturnType<typeof ownerWithPhoto>>;
  const confirm = (owner: Owner, secret = password) => app.inject({ method: "POST", url: "/api/profile/account/delete",
    headers: { origin, cookie: owner.cookie, "x-profile-owner": owner.id }, payload: { password: secret } });
  const ticket = (owner: Owner) => db.accountDeletionRequest.findUnique({ where: { userId: owner.id } });
  const readOwner = (owner: Owner) => db.user.findUnique({ where: { id: owner.id } });

  it("hides Discovery, ends existing sessions, and finishes only after the correct provider asset is erased", async () => {
    const owner = await ownerWithPhoto(), other = await ownerWithPhoto();
    expect((await confirm(owner, "incorrect")).statusCode).toBe(403);
    expect(await ticket(owner)).toBeNull();
    const result = await confirm(owner);
    expect(result.statusCode).toBe(202);
    expect(result.json()).toMatchObject({ status: "processing", id: (await ticket(owner))?.id });
    expect((await ticket(owner))?.state).toBe("CLEANING_PHOTOS");
    expect(await db.session.count({ where: { userId: owner.id } })).toBe(0);
    expect((await db.discoveryProfile.findUniqueOrThrow({ where: { ownerId: owner.id } })).pausedAt).toBeInstanceOf(Date);
    expect((await db.discoveryPhoto.findUniqueOrThrow({ where: { id: owner.photo.id } })).revokedAt).toBeInstanceOf(Date);
    expect(await readOwner(owner)).not.toBeNull();
    expect((await app.inject({ url: "/api/profile", headers: { cookie: owner.cookie } })).statusCode).toBe(401);
    const signIn = await app.inject({ method: "POST", url: "/api/auth/sign-in/email", headers: { origin }, payload: { email: owner.email, password } });
    expect(signIn.statusCode).toBeGreaterThanOrEqual(400);
    expect(signIn.headers["set-cookie"]).toBeUndefined();
    expect(await db.session.count({ where: { userId: owner.id } })).toBe(0);
    // A provider failure leaves the account and photo pointer intact for retry.
    destroy.mockRejectedValueOnce(Error("synthetic outage"));
    const now = new Date();
    await run(fake, now);
    expect(await readOwner(owner)).not.toBeNull();
    expect(await db.discoveryPhoto.findUniqueOrThrow({ where: { id: owner.photo.id } })).toMatchObject({ publicId: owner.photo.publicId, destroyedAt: null });
    await run(fake, new Date(+now + 120_000));
    expect(destroy.mock.calls).toEqual([[{ publicId: owner.photo.publicId }], [{ publicId: owner.photo.publicId }]]);
    expect(await readOwner(owner)).toBeNull();
    expect(await ticket(owner)).toBeNull();
    expect(await db.discoveryPhoto.findUnique({ where: { id: owner.photo.id } })).toBeNull();
    expect(await readOwner(other)).not.toBeNull();
    await run(fake, new Date(+now + 120_000));
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it("deletes a photo-history-only account without external storage access", async () => {
    const owner = await ownerWithPhoto({ history: true });
    process.env.CLOUDINARY_API_KEY = "";
    await db.discoveryPhotoAudit.create({ data: { photoId: owner.photo.id, actorId: owner.id, action: "DELETE", reason: "Owner removal", requestId: randomUUID(), decisionRevision: 1 } });
    expect((await confirm(owner)).statusCode).toBe(204);
    expect(await readOwner(owner)).toBeNull();
    expect(await db.discoveryPhotoAudit.count({ where: { photoId: owner.photo.id } })).toBe(0);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("keeps protected reports and unconfigured storage on the existing manual request path", async () => {
    const owner = await ownerWithPhoto(), reporter = await createPerson();
    const report = await db.discoveryReport.create({ data: { reportedUserId: owner.id, reporterId: reporter.id, photoId: owner.photo.id, reason: "Synthetic safety report" } });
    expect((await confirm(owner)).statusCode).toBe(409);
    const receipt = await app.inject({ method: "POST", url: "/api/profile/account/deletion-request", headers: { origin, cookie: owner.cookie, "x-profile-owner": owner.id }, payload: {} });
    expect(receipt.statusCode).toBe(200);
    expect(await ticket(owner)).toMatchObject({ id: receipt.json().id, state: "MANUAL_REQUEST" });
    await run(fake);
    expect(await db.discoveryReport.findUnique({ where: { id: report.id } })).not.toBeNull();
    expect(await db.session.count({ where: { userId: owner.id } })).toBe(1);
    const unconfigured = await ownerWithPhoto();
    process.env.CLOUDINARY_API_KEY = "";
    expect((await confirm(unconfigured)).statusCode).toBe(409);
    expect(await ticket(unconfigured)).toBeNull();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("routes exhausted storage retries to manual review and never drops the photo pointer", async () => {
    const owner = await ownerWithPhoto();
    expect((await confirm(owner)).statusCode).toBe(202);
    await db.discoveryPhotoJob.updateMany({ where: { photoId: owner.photo.id, kind: "DESTROY" }, data: { attempts: 9 } });
    // An empty/unconfirmed provider result must not count as successful erasure.
    destroy.mockResolvedValueOnce(undefined);
    await run(fake);
    expect((await ticket(owner))?.state).toBe("CLEANUP_NEEDS_REVIEW");
    expect(await readOwner(owner)).not.toBeNull();
    expect(await db.discoveryPhoto.findUniqueOrThrow({ where: { id: owner.photo.id } })).toMatchObject({ publicId: owner.photo.publicId, destroyedAt: null });
    expect(await db.session.count({ where: { userId: owner.id } })).toBe(0);
  });

  it("does not claim that an interrupted upload is gone just because storage initially reports it missing", async () => {
    const owner = await ownerWithPhoto({ unknown: true });
    expect((await confirm(owner)).statusCode).toBe(202);
    destroy.mockResolvedValueOnce("missing");
    await run(fake, new Date(Date.now() + 70_000));
    expect(destroy).toHaveBeenCalledWith({ publicId: owner.photo.publicId });
    expect((await ticket(owner))?.state).toBe("CLEANING_PHOTOS");
    expect(await readOwner(owner)).not.toBeNull();
    expect(await db.discoveryPhoto.findUniqueOrThrow({ where: { id: owner.photo.id } })).toMatchObject({ publicId: owner.photo.publicId, destroyedAt: null });
  });
});
