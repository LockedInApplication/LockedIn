import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson } from "../discovery/test/discovery.fixtures.js";

vi.mock("../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("Room to Talk", () => {
  let app: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
  let db: typeof import("../../lib/prisma.js").prisma;
  beforeAll(async () => {
    ({ prisma: db } = await import("../../lib/prisma.js"));
    app = await (await import("../../app.js")).buildServer({
      logStream: new Writable({ write(_chunk, _encoding, done) { done(); } }),
    });
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  type Person = Awaited<ReturnType<typeof createPerson>>;
  const get = (person: Person, url: string) => app.inject({ url, headers: { cookie: person.cookie } });
  const write = (person: Person, method: "POST" | "PUT" | "DELETE", url: string, payload?: object, overrides?: Record<string, string>) => app.inject({
    method, url, payload, headers: { cookie: person.cookie, origin: "http://localhost:3001", "x-together-owner": person.id, ...overrides },
  });
  async function pair(locked = true) {
    const [a, b] = await Promise.all([createPerson(), createPerson()]);
    const space = await db.relationship.create({
      data: { directLockedInAt: locked ? new Date() : null, members: { create: [{ userId: a.id }, { userId: b.id }] } },
    });
    return { a, b, space, url: `/api/journey/relationships/${space.id}/room-to-talk` };
  }
  const topicInput = (question: string, shelf = "date-ideas") => ({ id: randomUUID(), question, shelf });
  const postMessage = (person: Person, path: string, body: string, kind = "REPLY", replyToId: string | null = null) =>
    write(person, "POST", `${path}/messages`, { id: randomUUID(), kind, body, replyToId });
  const state = (person: Person, path: string, action: string, extra?: object) => write(person, "POST", `${path}/state`, { action, ...extra });
  async function openTopic(a: Person, b: Person, url: string, question: string, shelf?: string) {
    const input = topicInput(question, shelf);
    expect((await write(a, "POST", url + "/topics", input)).statusCode).toBe(201);
    const path = `${url}/topics/${input.id}`;
    expect((await state(a, path, "suggest")).statusCode).toBe(200);
    expect((await state(b, path, "start")).statusCode).toBe(200);
    return { ...input, path };
  }

  it("serves shared shelves only to the locked-in pair and saves questions quietly", async () => {
    const { a, b, space, url } = await pair(false);
    const other = await pair();
    expect((await get(a, url)).statusCode).toBe(404);
    await db.relationship.update({ where: { id: space.id }, data: { directLockedInAt: new Date() } });
    const empty = await get(a, url);
    expect(empty.headers["cache-control"]).toBe("private, no-store");
    expect(empty.json()).toEqual({
      shelves: [{ id: "marriage", name: "Marriage" }, { id: "date-ideas", name: "Date ideas" }, { id: "unsorted", name: "Unsorted" }],
      topics: [],
    });
    expect((await get(other.a, url)).statusCode).toBe(404);

    const shelf = { id: randomUUID(), name: "Books" };
    expect((await write(a, "POST", url + "/shelves", shelf, { origin: "https://different.example" })).statusCode).toBe(403);
    expect((await write(a, "POST", url + "/shelves", shelf, { "x-together-owner": b.id })).statusCode).toBe(409);
    expect((await write(a, "POST", url + "/shelves", shelf)).json()).toEqual(shelf);
    expect((await write(a, "POST", url + "/shelves", shelf)).json()).toEqual(shelf);
    expect((await write(b, "POST", url + "/shelves", { id: randomUUID(), name: "books" })).statusCode).toBe(409);
    expect((await write(other.a, "POST", other.url + "/topics", topicInput("Outside room", shelf.id))).statusCode).toBe(404);

    const input = topicInput("A book to read together?", "unsorted");
    expect((await write(a, "POST", url + "/topics", input)).statusCode).toBe(201);
    expect((await write(a, "POST", url + "/topics", input)).statusCode).toBe(201);
    const path = `${url}/topics/${input.id}`;
    expect((await get(other.a, path + "/messages")).statusCode).toBe(404);
    expect((await get(other.a, `${other.url}/topics/${input.id}/messages`)).statusCode).toBe(404);
    expect((await write(b, "PUT", path + "/shelf", { shelf: shelf.id })).json()).toMatchObject({ shelf: shelf.id, yours: false, phase: "SAVED" });
    expect((await get(a, url)).json().topics).toEqual([expect.objectContaining({ id: input.id, question: input.question, shelf: shelf.id, yours: true })]);
    expect(await db.notification.count({ where: { relationshipId: space.id } })).toBe(0);
    await db.invitationBlock.create({ data: { blockerId: b.id, blockedId: a.id } });
    expect((await get(a, url)).statusCode).toBe(404);
    expect((await get(b, path + "/messages")).statusCode).toBe(404);
  });

  it("opens the thread only after the other person agrees, supports quoted answers, and keeps the history when discussed", async () => {
    const { a, b, url } = await pair();
    const input = topicInput("What does a good Sunday look like?");
    await write(a, "POST", url + "/topics", input);
    const path = `${url}/topics/${input.id}`;
    expect((await postMessage(a, path, "Too soon")).statusCode).toBe(409);
    expect((await state(a, path, "suggest")).json()).toMatchObject({ phase: "SUGGESTED", suggestedBy: "you" });
    expect((await state(a, path, "start")).statusCode).toBe(409);
    expect((await state(b, path, "withdraw")).statusCode).toBe(409);
    const inbox = (await get(b, "/api/journey/notifications")).json();
    expect(inbox.items[0]).toMatchObject({ kind: "ROOM_TALK_SUGGESTED", view: "room-to-talk", entityId: input.id, resolvedAt: null });
    expect(JSON.stringify(inbox)).not.toContain(input.question);
    expect((await state(b, path, "later")).json()).toMatchObject({ phase: "SAVED", suggestedBy: null });
    expect((await get(b, "/api/journey/notifications")).json().unreadCount).toBe(0);
    await state(b, path, "suggest");
    expect((await state(a, path, "start")).json()).toMatchObject({ phase: "TALK_NEXT", suggestedBy: null });

    const followUp = (await postMessage(a, path, "Could we go outside first?", "QUESTION")).json();
    const other = await openTopic(a, b, url, "Another topic");
    expect((await postMessage(b, other.path, "Wrong topic", "REPLY", followUp.id)).statusCode).toBe(404);
    expect((await postMessage(a, path, "My own question", "REPLY", followUp.id)).statusCode).toBe(404);
    const answer = { id: randomUUID(), kind: "REPLY", body: "Yes, then coffee.", replyToId: followUp.id };
    expect((await write(b, "POST", path + "/messages", answer)).statusCode).toBe(201);
    expect((await write(b, "POST", path + "/messages", answer)).statusCode).toBe(201);
    expect((await get(a, path + "/messages")).json().messages).toMatchObject([
      { id: followUp.id, kind: "QUESTION", body: "Could we go outside first?", yours: true },
      { id: answer.id, kind: "REPLY", body: answer.body, yours: false, replyTo: { id: followUp.id, yours: true } },
    ]);

    expect((await state(b, path, "discuss", { takeaway: "Always make time to get outside." })).json())
      .toMatchObject({ phase: "DISCUSSED", messageCount: 2, takeaway: "Always make time to get outside.", shelf: input.shelf });
    expect((await postMessage(a, path, "Closed thread")).statusCode).toBe(409);
    expect((await get(b, path + "/messages")).json().messages).toHaveLength(2);
    expect((await state(a, path, "reopen")).json()).toMatchObject({ phase: "SAVED", messageCount: 2 });
    await state(b, path, "suggest");
    await state(a, path, "start");
    expect((await postMessage(a, path, "Back to the same conversation")).statusCode).toBe(201);
    expect((await get(a, path + "/messages")).json().messages).toHaveLength(3);
  });

  it("removes a shared custom shelf without deleting its topics, replies, or takeaways", async () => {
    const { a, b, url, space } = await pair();
    const other = await pair();
    const shelf = { id: randomUUID(), name: "Traditions" };
    expect((await write(a, "POST", url + "/shelves", shelf)).statusCode).toBe(201);
    const { id, path } = await openTopic(a, b, url, "What traditions should we start?", shelf.id);
    const message = await postMessage(a, path, "Pancakes on the first Sunday.");
    expect(message.statusCode).toBe(201);
    const takeaway = "Make the first Sunday our own.";
    expect((await state(b, path, "discuss", { takeaway })).statusCode).toBe(200);

    const shelfPath = url + "/shelves/" + shelf.id;
    expect((await write(other.a, "DELETE", shelfPath)).statusCode).toBe(404);
    expect((await write(other.a, "DELETE", other.url + "/shelves/" + shelf.id)).statusCode).toBe(404);
    expect((await write(a, "DELETE", shelfPath, undefined, { "x-together-owner": b.id })).statusCode).toBe(409);
    expect((await write(b, "DELETE", shelfPath)).json()).toEqual({ movedTopicCount: 1 });
    expect(await db.roomTalkShelf.findUnique({ where: { id: shelf.id } })).toBeNull();

    for (const person of [a, b]) {
      const room = (await get(person, url)).json();
      expect(room.shelves).not.toContainEqual(shelf);
      expect(room.topics).toEqual([expect.objectContaining({ id, shelf: "unsorted", phase: "DISCUSSED", takeaway, messageCount: 1 })]);
      expect((await get(person, path + "/messages")).json().messages[0]).toMatchObject({ id: message.json().id, body: "Pancakes on the first Sunday." });
    }
    expect((await write(b, "DELETE", shelfPath)).statusCode).toBe(404);
    expect(await db.notification.count({ where: { relationshipId: space.id } })).toBe(1);
  });

  it("lets each pair remove Marriage and Date ideas but keeps Unsorted available", async () => {
    const { a, b, url } = await pair();
    const other = await pair();
    const marriage = topicInput("What helps us make decisions together?", "marriage");
    const date = topicInput("Pick a new place for breakfast.", "date-ideas");
    for (const input of [marriage, date]) expect((await write(a, "POST", url + "/topics", input)).statusCode).toBe(201);
    expect((await state(a, `${url}/topics/${marriage.id}`, "suggest")).statusCode).toBe(200);
    expect((await write(a, "POST", url + "/shelves", { id: randomUUID(), name: "Marriage" })).statusCode).toBe(409);
    expect((await write(b, "DELETE", url + "/shelves/unsorted")).statusCode).toBe(404);
    expect((await write(other.a, "DELETE", url + "/shelves/marriage")).statusCode).toBe(404);
    expect((await write(a, "DELETE", url + "/shelves/marriage")).json()).toEqual({ movedTopicCount: 1 });
    expect((await write(b, "DELETE", url + "/shelves/date-ideas")).json()).toEqual({ movedTopicCount: 1 });

    const room = (await get(b, url)).json();
    expect(room.shelves).toEqual([{ id: "unsorted", name: "Unsorted" }]);
    expect(room.topics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: marriage.id, shelf: "unsorted", phase: "SUGGESTED", suggestedBy: "partner" }),
      expect.objectContaining({ id: date.id, shelf: "unsorted", phase: "SAVED" }),
    ]));
    expect((await write(a, "POST", url + "/topics", topicInput("A topic for a deleted shelf.", "marriage"))).statusCode).toBe(404);
    expect((await write(b, "PUT", `${url}/topics/${date.id}/shelf`, { shelf: "date-ideas" })).statusCode).toBe(404);
    const replacement = { id: randomUUID(), name: "Marriage" };
    expect((await write(b, "POST", url + "/shelves", replacement)).json()).toEqual(replacement);
    expect((await get(a, url)).json().shelves).toEqual([replacement, { id: "unsorted", name: "Unsorted" }]);
    expect((await get(other.a, other.url)).json().shelves.map((item: {id: string}) => item.id)).toEqual(["marriage", "date-ideas", "unsorted"]);
  });

  it("keeps replies open and alerts only an away partner, including when they are on another topic", async () => {
    const { a, b, url, space } = await pair();
    const topic = await openTopic(a, b, url, "Trip together?");
    const other = await openTopic(a, b, url, "Different topic");
    const firstView = topic.path + "/presence/" + randomUUID();
    const secondView = topic.path + "/presence/" + randomUUID();
    const otherView = other.path + "/presence/" + randomUUID();
    const marker = topic.path + "/in-person";
    const mark = (person: Person, saved: boolean) => write(person, "PUT", marker, { saved });
    const alerts = () => db.notification.findMany({ where: { relationshipId: space.id, kind: "ROOM_TALK_IN_PERSON" }, orderBy: { id: "asc" } });

    await write(b, "PUT", firstView);
    await write(b, "PUT", secondView);
    await write(b, "DELETE", firstView);
    expect((await mark(a, true)).json()).toMatchObject({ phase: "TALK_NEXT", inPersonBy: "you" });
    expect(await alerts()).toHaveLength(0); // B’s second visible tab is on this exact topic.
    expect((await get(b, url)).json().topics.find((item: { id: string }) => item.id === topic.id)).toMatchObject({ inPersonBy: "partner" });
    expect((await postMessage(b, topic.path, "Have you got a place in mind?", "QUESTION")).statusCode).toBe(201);
    expect((await postMessage(a, topic.path, "Yes, let's keep chatting here too.")).statusCode).toBe(201);

    await mark(b, false);
    await write(b, "DELETE", secondView);
    await write(b, "PUT", otherView);
    const repeated = await Promise.all([mark(a, true), mark(a, true)]);
    expect(repeated.map(response => response.statusCode)).toEqual([200, 200]);
    expect(await alerts()).toEqual([expect.objectContaining({ recipientId: b.id, entityId: topic.id, readAt: null, resolvedAt: null })]);
    const inbox = (await get(b, "/api/journey/notifications")).json();
    expect(inbox.items[0]).toMatchObject({ kind: "ROOM_TALK_IN_PERSON", entityId: topic.id, view: "room-to-talk" });
    expect(JSON.stringify(inbox.items[0])).not.toContain(topic.question);

    await write(b, "PUT", firstView);
    expect((await alerts())[0]?.readAt).not.toBeNull();
    await mark(a, false);
    await db.roomTalkPresence.updateMany({ where: { userId: b.id, topicId: topic.id }, data: { expiresAt: new Date(0) } });
    await mark(a, true);
    expect(await alerts()).toEqual([expect.objectContaining({ resolvedAt: expect.any(Date) }), expect.objectContaining({ readAt: null, resolvedAt: null })]);
    expect((await state(b, topic.path, "discuss", { takeaway: null })).json()).toMatchObject({ phase: "DISCUSSED", inPersonBy: null });
    expect(await db.roomTalkPresence.count({ where: { topicId: topic.id } })).toBe(0);
    expect((await alerts()).every(alert => alert.resolvedAt)).toBe(true);
  });

  it("paginates long threads and closes access when a partner leaves", async () => {
    const { a, b, url, space } = await pair();
    const { id, path } = await openTopic(a, b, url, "A long conversation");
    await db.roomTalkMessage.createMany({ data: Array.from({ length: 52 }, (_, index) => ({
      topicId: id, authorId: index % 2 ? a.id : b.id, kind: "REPLY" as const, body: `Reply ${index + 1}`, createdAt: new Date(1700000000000 + index),
    })) });
    const first = (await get(b, path + "/messages")).json();
    expect(first.messages).toHaveLength(50);
    expect(first.messages[0]).toMatchObject({ body: "Reply 3" });
    const older = (await get(b, path + "/messages?before=" + first.before)).json();
    expect(older.messages.map((message: { body: string }) => message.body)).toEqual(["Reply 1", "Reply 2"]);
    expect(older.before).toBeNull();
    expect((await app.inject({ method: "POST", url: `/api/journey/relationships/${space.id}/leave`, headers: { cookie: a.cookie } })).statusCode).toBe(200);
    expect((await get(b, path + "/messages")).statusCode).toBe(404);
    expect((await postMessage(b, path, "After leaving")).statusCode).toBe(404);
  });

  it("removes the pair’s Room to Talk content when one participant erases their account", async () => {
    const { a, b, url, space } = await pair();
    const { id, path } = await openTopic(a, b, url, "Private topic");
    await postMessage(a, path, "A private reply");
    await state(b, path, "discuss", { takeaway: "Partner-authored takeaway" });
    expect((await write(a, "DELETE", url + "/shelves/marriage")).statusCode).toBe(200);
    const { eraseAccountRows } = await import("../profile/account-deletion.data.js");
    await db.$transaction(tx => eraseAccountRows(tx, b.id, b.email));
    expect(await db.roomTalkTopic.findUnique({ where: { id } })).toBeNull();
    expect(await db.roomTalkMessage.count({ where: { topicId: id } })).toBe(0);
    expect(await db.roomTalkRemovedStarterShelf.count({ where: { relationshipId: space.id } })).toBe(0);
    expect(await db.relationship.findUnique({ where: { id: space.id } })).toMatchObject({ status: "ENDED" });
    expect((await get(a, url)).statusCode).toBe(404);
  });
});
