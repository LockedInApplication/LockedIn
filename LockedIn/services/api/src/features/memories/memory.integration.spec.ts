import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson } from "../discovery/test/discovery.fixtures.js";

vi.mock("../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("Behind the Photo", () => {
  let app: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
  let db: typeof import("../../lib/prisma.js").prisma;
  beforeAll(async () => {
    ({ prisma: db } = await import("../../lib/prisma.js"));
    app = await (await import("../../app.js")).buildServer();
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  type Person = Awaited<ReturnType<typeof createPerson>>;
  const origin = "http://localhost:3001";
  const get = (person: Person, url: string) => app.inject({ url, headers: { cookie: person.cookie } });
  const remove = (person: Person, url: string) => app.inject({ method: "DELETE", url, headers: { cookie: person.cookie, origin, "x-together-owner": person.id } });
  async function send(person: Person, method: "POST" | "PUT", url: string, fields: Record<string, string>, attachment?: [string, Blob], overrides?: Record<string, string>) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    if (attachment) body.set(attachment[0], attachment[1], "fixture");
    const encoded = new Request("http://localhost", { method, body });
    return app.inject({
      method, url, payload: Buffer.from(await encoded.arrayBuffer()),
      headers: { cookie: person.cookie, origin, "x-together-owner": person.id, "content-type": encoded.headers.get("content-type")!, ...overrides },
    });
  }
  function voice(frames = 160_000) {
    const bytes = new ArrayBuffer(44 + 2 * frames);
    const pcm = new DataView(bytes);
    const tag = (offset: number, value: string) => new Uint8Array(bytes, offset, value.length).set(new TextEncoder().encode(value));
    tag(0, "RIFF"); pcm.setUint32(4, bytes.byteLength - 8, true); tag(8, "WAVEfmt ");
    pcm.setUint32(16, 16, true); pcm.setUint16(20, 1, true); pcm.setUint16(22, 1, true);
    pcm.setUint32(24, 16000, true); pcm.setUint32(28, 32000, true);
    pcm.setUint16(32, 2, true); pcm.setUint16(34, 16, true); tag(36, "data"); pcm.setUint32(40, 2 * frames, true);
    return new Blob([bytes], { type: "audio/wav" });
  }

  it("shares private files and separate notes in an active lock-in, then revokes access", async () => {
    const a = await createPerson(), b = await createPerson(), stranger = await createPerson();
    const space = await db.relationship.create({ data: { members: { create: [{ userId: a.id }, { userId: b.id }] } } });
    const path = `/api/journey/relationships/${space.id}/memories`;
    expect((await app.inject({ url: path })).statusCode).toBe(401);
    expect((await get(a, path)).statusCode).toBe(404);
    await db.relationship.update({ where: { id: space.id }, data: { directLockedInAt: new Date() } });
    expect((await get(stranger, path)).statusCode).toBe(404);
    const image = await sharp({ create: { width: 330, height: 220, channels: 3, background: "#875752" } }).png().toBuffer();
    const photo = { id: randomUUID(), title: "Saturday at four" };
    const file: [string, Blob] = ["file", new Blob([new Uint8Array(image)], { type: "image/png" })];
    expect((await send(a, "POST", path, photo, file, { origin: "https://other.example" })).statusCode).toBe(403);
    expect((await send(a, "POST", path, photo, file, { "x-together-owner": b.id })).statusCode).toBe(409);
    expect((await send(stranger, "POST", path, photo, file)).statusCode).toBe(404);
    expect((await send(a, "POST", path, photo, file)).statusCode).toBe(201);
    expect((await send(a, "POST", path, photo, file)).statusCode).toBe(201);
    const picture = `${path}/${photo.id}`;
    const gallery = (await get(b, path)).json();
    expect(gallery).toEqual({ photos: [{ ...photo, yours: false, width: 330, height: 220, createdAt: expect.any(String), pins: [] }] });
    const imageResponse = await get(b, `${picture}/media`);
    expect(imageResponse.statusCode).toBe(200);
    expect(imageResponse.headers["cache-control"]).toBe("private, no-store");
    expect(imageResponse.headers["content-type"]).toBe("image/jpeg");
    expect((await get(stranger, `${picture}/media`)).statusCode).toBe(404);
    expect((await remove(b, picture)).statusCode).toBe(404);

    const pin = { id: randomUUID(), title: "Foam heart", x: "5025", y: "5075" };
    expect((await send(b, "POST", `${picture}/pins`, { ...pin, x: "10001", text: "Wrong location" })).statusCode).toBe(400);
    expect((await send(a, "POST", `${picture}/pins`, { ...pin, text: "We swapped cups." }, ["voice", voice()])).statusCode).toBe(201);
    const pinPath = `${picture}/pins/${pin.id}`;
    expect((await remove(b, `${pinPath}/note/voice`)).statusCode).toBe(404);
    expect((await send(b, "PUT", `${pinPath}/note`, {}, ["voice", voice(160_001)])).statusCode).toBe(413);
    expect((await send(b, "PUT", `${pinPath}/note`, {}, ["voice", new Blob(["not a WAV"], { type: "audio/wav" })])).statusCode).toBe(400);
    const reply = await send(b, "PUT", `${pinPath}/note`, { text: "The foam was already cold." }, ["voice", voice(16000)]);
    expect(reply.statusCode).toBe(200);
    const { id: noteId } = reply.json();
    const latest = (await get(a, path)).json().photos[0].pins[0];
    expect(latest).toMatchObject({ title: pin.title, x: 5025, y: 5075, notes: [
      { yours: true, text: "We swapped cups.", voiceDurationMs: 10000 },
      { yours: false, text: "The foam was already cold.", voiceDurationMs: 1000 },
    ] });
    expect(latest.notes[1]).not.toHaveProperty("voice");
    expect(latest.notes[1]).not.toHaveProperty("authorId");
    const audioPath = `${pinPath}/notes/${noteId}/voice`;
    const audio = await get(a, audioPath);
    expect(audio.statusCode).toBe(200);
    expect(audio.headers["content-type"]).toBe("audio/wav");
    expect(audio.headers["cache-control"]).toBe("private, no-store");
    expect(audio.rawPayload.subarray(0, 4).toString()).toBe("RIFF");
    expect((await get(stranger, audioPath)).statusCode).toBe(404);
    expect((await remove(b, `${pinPath}/note/text`)).statusCode).toBe(200);
    expect((await get(a, audioPath)).statusCode).toBe(200);
    const block = await db.invitationBlock.create({ data: { blockerId: b.id, blockedId: a.id } });
    expect((await get(a, audioPath)).statusCode).toBe(404);
    expect((await get(b, path)).statusCode).toBe(404);
    await db.invitationBlock.delete({ where: { id: block.id } });
    const left = await app.inject({ method: "POST", url: `/api/journey/relationships/${space.id}/leave`, headers: { cookie: a.cookie, origin } });
    expect(left.statusCode).toBe(200);
    expect((await get(b, audioPath)).statusCode).toBe(404);
    expect((await get(b, `${picture}/media`)).statusCode).toBe(404);
  });

  it("requires explicit Discovery lock-in and honors closure of the linked contact", async () => {
    const a = await createPerson(), b = await createPerson();
    const pair = [a.id, b.id].sort();
    const space = await db.relationship.create({ data: { members: { create: [{ userId: a.id }, { userId: b.id }] } } });
    const path = `/api/journey/relationships/${space.id}/memories`;
    const source = await db.discoveryConnection.create({ data: {
      userLowId: pair[0]!, userHighId: pair[1]!, inviterId: a.id, relationshipId: space.id,
      state: "PROMOTED", expiresAt: new Date(Date.now() + 60_000),
      questionKey: "support", questionText: "What helps?", hello: "Hello.", senderPublicName: "Sam", senderAvatarPreset: "initials",
    } });
    expect((await get(a, path)).statusCode).toBe(404);
    await db.discoveryConnection.update({ where: { id: source.id }, data: { lockedInAt: new Date() } });
    expect((await get(a, path)).json()).toEqual({ photos: [] });
    expect((await get(b, path)).statusCode).toBe(200);
    await db.discoveryConnection.update({ where: { id: source.id }, data: { closedAt: new Date() } });
    expect((await get(a, path)).statusCode).toBe(404);
    expect((await get(b, path)).statusCode).toBe(404);
  });
});
