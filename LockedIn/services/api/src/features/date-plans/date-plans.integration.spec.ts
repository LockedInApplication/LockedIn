import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures } from "../discovery/test/discovery-connection.fixtures.js";
import { createPerson } from "../discovery/test/discovery.fixtures.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { dateSpotTicket } from "../date-spots/date-spots-ticket.js";

vi.mock("../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("date planning through an authorized chat", () => {
  let app: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
  let prisma: typeof import("../../lib/prisma.js").prisma;
  const oldEnv = { ...process.env };
  const venue = { id: "test-gallery", name: "Test Gallery", address: "1 Public Way", categories: ["entertainment.culture.gallery"], latitude: 40.746, longitude: -73.955 };
  const area = { areaId: "test-area", label: "Private starting area", latitude: 40.75, longitude: -73.97 };

  beforeAll(async () => {
    Object.assign(process.env, { DATE_PLANS_ENABLED: "true", DATE_SPOTS_ENABLED: "true", DATE_SPOTS_GEOAPIFY_API_KEY: "local-only", SHARED_MESSAGING_ENABLED: "true", DISCOVERY_CHAT_ENABLED: "true", DATE_SPOT_AREAS_JSON: JSON.stringify([area]) });
    ({ prisma } = await import("../../lib/prisma.js"));
    app = await (await import("../../app.js")).buildServer({ dateSpotProvider: { search: async () => [venue], details: async () => null } });
    await app.listen({ port: 0, host: "127.0.0.1" });
  });
  afterAll(async () => { process.env = oldEnv; await app?.close(); await prisma?.$disconnect(); });

  const chat = (id: string) => "/api/messaging/conversations/" + id;
  const plans = (id: string) => chat(id) + "/date-plans";
  const request = (actor: { id: string; cookie: string }, url: string, payload?: object, headers = {}) => app.inject({
    method: payload ? "POST" : "GET", url, headers: { cookie: actor.cookie, origin: "http://localhost:3001", "x-messaging-owner": actor.id, ...headers },
    ...(payload ? { payload } : {}),
  });
  type Response = { statusCode: number; json: () => any };
  const value = (result: Response) => {
    expect(result.statusCode, JSON.stringify(result.json())).toBe(200);
    return result.json().value;
  };
  const time = (day = 2) => {
    const startsAt = new Date((Math.floor(Date.now() / 60_000) + day * 1440) * 60_000).toISOString();
    return { startsAt, localTime: startsAt.slice(0, 16), timeZone: "UTC" };
  };
  const change = (action: string, plan: { id: string; revision: number }, extra?: object) => ({ action, planId: plan.id, revision: plan.revision, requestId: randomUUID(), ...extra });

  async function fixture(discovery = false) {
    const f = connectionFixtures(app);
    type Person = Awaited<ReturnType<typeof createPerson>>;
    let a: Person, b: Person;
    let id: string;
    if (discovery) {
      const sender = await f.person(), recipient = await f.person();
      id = value(await f.send(sender, recipient)).id;
      a = sender;
      b = recipient;
      value(await f.request(b, "POST", "/api/discovery/connections/" + id + "/accept", {}));
    } else {
      a = await createPerson();
      b = await createPerson();
      const relationship = await prisma.relationship.create({ data: { members: { create: [a, b].map(user => ({ userId: user.id })) } } });
      const { ensureRelationshipConversation } = await import("../messaging/messaging-conversation.service.js");
      id = (await prisma.$transaction(tx => ensureRelationshipConversation(tx, relationship.id))).id;
    }
    const spots = chat(id) + "/date-spots";
    const ticket = value(await request(a, spots, { action: "solo", preferences: { areaId: area.areaId, interests: ["art"] } })).items[0].ticket;
    const sourceMessageId = value(await request(a, spots, { action: "share", ticket, requestId: randomUUID() })).message.id;
    const propose = (nextTime = time()) => ({ action: "propose", sourceMessageId, requestId: randomUUID(), time: nextTime });
    const action = (actor: typeof a, input: object) => request(actor, plans(id), input);
    const calendar = (actor: typeof a, planId: string) => request(actor, plans(id) + "/" + planId + "/calendar");
    return { a, b, id, sourceMessageId, propose, action, calendar, f };
  }

  it("only confirms the current counterpart proposal and exports it once", async () => {
    const { a, b, id, propose, action, calendar, f } = await fixture(true);
    const initial = time(), next = time(4);
    const proposed = value(await action(b, propose(initial))).activePlan;
    expect(proposed).toMatchObject({ venueName: venue.name, startsAt: initial.startsAt, revision: 1, proposer: "self", state: "pending" });
    expect((await action(b, change("confirm", proposed))).statusCode).toBe(409);
    expect((await calendar(a, proposed.id)).statusCode).toBe(404);
    const counter = value(await action(a, change("counter", proposed, { time: next }))).activePlan;
    expect(counter).toMatchObject({ revision: 2, startsAt: next.startsAt, state: "pending" });
    expect((await action(a, change("confirm", proposed))).statusCode).toBe(409);
    const confirm = change("confirm", counter);
    const events: unknown[][] = [], close = notificationBroker.subscribe(a.id, (...args) => events.push(args))!;
    try {
      const results = await Promise.all([action(b, confirm), action(b, confirm)]);
      expect((await action(b, change("confirm", counter))).statusCode).toBe(409);
      expect(value(results[0]!).message.id).toBe(value(results[1]!).message.id);
      expect(value(results[0]!).activePlan).toMatchObject({ state: "confirmed", proposer: "partner", startsAt: next.startsAt });
      expect(events).toEqual([[false, "chat"]]);
    } finally { close(); }
    const legacy = value(await f.request(a, "GET", "/api/discovery/connections/" + id + "/messages")).items;
    expect(legacy.slice(1).map((message: { datePlanEvent: { startsAt: string; action: string } }) => [message.datePlanEvent.action, message.datePlanEvent.startsAt])).toEqual([["propose", initial.startsAt], ["counter", next.startsAt], ["confirm", next.startsAt]]);
    const exportResult = await calendar(a, proposed.id);
    expect(exportResult.headers["cache-control"]).toBe("private, no-store");
    expect(value(exportResult).contents).toContain("LOCATION:Test Gallery");
    expect(value(exportResult).contents).not.toMatch(/ATTENDEE|Private starting area/);
    expect(value(await action(a, change("cancel", counter))).activePlan).toBeNull();
    expect(value(await action(b, confirm)).activePlan).toBeNull();
    expect((await calendar(b, proposed.id)).statusCode).toBe(404);
  });

  it("only lets the appropriate member decline, withdraw or cancel", async () => {
    const { a, b, action, propose } = await fixture();
    let active = value(await action(a, propose())).activePlan;
    expect((await action(a, change("decline", active))).statusCode).toBe(409);
    expect((await action(b, change("withdraw", active))).statusCode).toBe(409);
    expect((await action(b, change("cancel", active))).statusCode).toBe(409);
    expect((await action(b, propose())).statusCode).toBe(409);
    expect(value(await action(b, change("decline", active))).activePlan).toBeNull();
    active = value(await action(b, propose())).activePlan;
    expect(value(await action(b, change("withdraw", active))).activePlan).toBeNull();
    active = value(await action(a, propose())).activePlan;
    const confirmed = value(await action(b, change("confirm", active))).activePlan;
    expect(value(await action(b, change("cancel", confirmed))).activePlan).toBeNull();
  });

  it.each([true, false])("sends a ticket as one legacy-compatible invite (discovery=%s)", async discovery => {
    const { a, b, id, action } = await fixture(discovery);
    const url = chat(id) + "/messages";
    const before = value(await request(a, url)).items.length;
    const ticket = dateSpotTicket(id, a.id, venue.id, venue.name, process.env.BETTER_AUTH_SECRET!, Date.now() - 29 * 60_000);
    const input = { action: "propose", ticket, requestId: randomUUID(), time: time() };
    expect((await action(b, input)).statusCode).toBe(404);
    const { activePlan, message } = value(await action(a, input));
    const legacy = value(await request(b, url)).items;
    expect(legacy).toHaveLength(before + 1);
    expect(legacy.at(-1)).toMatchObject({ id: message.id, datePlanEvent: { id: activePlan.id, action: "propose", venueName: venue.name } });
    expect(legacy.at(-1)).not.toHaveProperty("dateSpot");
    expect(JSON.stringify({ activePlan, message })).not.toContain(venue.id);
    expect(JSON.stringify({ activePlan, message })).not.toContain(ticket);
    const { applyDatePlanAction } = await import("./date-plan-service.js");
    const { openConversation } = await import("../messaging/messaging-access.service.js");
    const replay = await prisma.$transaction(async tx => {
      const conversation = await openConversation(tx, id, a.id, true);
      if (!conversation) throw new Error("Expected test chat");
      return applyDatePlanAction(tx, conversation, a.id, { ...input, action: "propose" }, new Date(Date.now() + 2 * 60_000));
    });
    expect(replay).toMatchObject({ ok: true, value: { message: { id: message.id } } });
    expect((await action(a, { ...input, time: time(5) })).statusCode).toBe(409);
    const source = plans(id) + "/" + activePlan.id;
    expect(value(await request(b, source))).toMatchObject({ plan: { id: activePlan.id }, activity: [{ id: message.id }], canAct: true });
    expect(value(await action(b, change("confirm", activePlan))).activePlan.state).toBe("confirmed");
    expect(value(await action(b, change("cancel", activePlan))).activePlan).toBeNull();
    expect(value(await request(a, source))).toMatchObject({ plan: { state: "canceled" }, canAct: false });
    await request(b, chat(id) + "/block", {});
    expect((await request(a, source)).statusCode).toBe(404);
  });

  it("lists only explicitly shared places, including shares older than the chat page", async () => {
    const { a, b, id, sourceMessageId } = await fixture();
    const another = await fixture();
    const conversation = await prisma.chatConversation.findUniqueOrThrow({ where: { id } });
    await prisma.discoveryMessage.createMany({ data: Array.from({ length: 31 }, () => ({
      conversationId: conversation.id, senderId: a.id, requestId: randomUUID(), text: "Suggested date spot: Not a trusted venue",
    })) });
    expect(value(await request(b, plans(id) + "/venues")).items).toEqual([{ id: sourceMessageId, name: venue.name }]);
    expect((await request(another.a, plans(id) + "/venues")).statusCode).toBe(404);
  });

  it.each([true, false])("keeps text and exact-plan receipts independent (discovery=%s)", async discovery => {
    const { a, b, id, action, propose } = await fixture(discovery);
    const url = chat(id) + "/messages";
    const unread = (actor: typeof a) => request(actor, "/api/messaging/unread?presentation=sheet").then(value);
    const dates = async (actor: typeof a) => (await unread(actor)).dates.items.map((entry: { planId: string }) => entry.planId);
    const first = value(await action(a, propose()));
    const firstId = first.activePlan.id;
    const accepted = value(await action(b, change("confirm", first.activePlan))).activePlan;
    const canceled = value(await action(a, change("cancel", accepted))).message;
    const next = value(await action(a, propose(time(5))));
    expect(await dates(b)).toEqual([next.activePlan.id, firstId]);
    expect(await dates(a)).toEqual([firstId]);
    expect(value(await request(b, plans(id) + "?presentation=sheet")).unreadUpdate).toEqual({ planId: next.activePlan.id, action: "propose" });
    expect(value(await request(b, url + "?presentation=sheet")).items.map((row: { datePlanEvent?: { action: string } }) => row.datePlanEvent?.action).filter(Boolean)).toEqual(["propose", "propose"]);
    expect(value(await request(b, url)).items.map((row: { datePlanEvent?: { action: string } }) => row.datePlanEvent?.action).filter(Boolean)).toEqual(["propose", "confirm", "cancel", "propose"]);
    const readFirst = plans(id) + "/" + firstId + "/read";
    expect((await request(b, readFirst, { through: next.message.sequence })).statusCode).toBe(404);
    expect((await request(b, chat(id) + "/read?presentation=sheet", { through: next.message.sequence })).statusCode).toBe(404);
    const plain = value(await request(a, url, { text: "See you soon", requestId: randomUUID() }));
    value(await request(b, readFirst, { through: canceled.sequence }));
    expect(await dates(b)).toEqual([next.activePlan.id]);
    expect((await unread(b)).items).toEqual([expect.objectContaining({ conversationId: id })]);
    value(await request(b, chat(id) + "/read?presentation=sheet", { through: plain.sequence }));
    expect((await unread(b)).items).toEqual([]);
    expect(await dates(b)).toEqual([next.activePlan.id]);
    await prisma.user.update({ where: { id: b.id }, data: { inAppActivity: false } });
    expect(await dates(b)).toEqual([]);
    expect(value(await request(b, plans(id) + "?presentation=sheet"))).toMatchObject({ activePlan: { id: next.activePlan.id }, unreadUpdate: null });
    await prisma.user.update({ where: { id: b.id }, data: { inAppActivity: true } });
    value(await request(b, chat(id) + "/read", { through: next.message.sequence }));
    expect(await dates(b)).toEqual([]);
  });

  it("fills compact pages before applying the cursor even across many hidden date events", async () => {
    const { a, b, id, action, propose } = await fixture();
    const { activePlan, message } = value(await action(a, propose()));
    const original = await prisma.discoveryMessage.findUniqueOrThrow({ where: { id: message.id } });
    await prisma.discoveryMessage.createMany({ data: Array.from({ length: 37 }, (_, i) => [
      { conversationId: id, senderId: a.id, requestId: randomUUID(), text: `Ordinary ${i}` },
      { conversationId: id, senderId: a.id, requestId: randomUUID(), text: "Suggested another time.",
        datePlanEvent: { ...(original.datePlanEvent as object), id: activePlan.id, action: "counter" } },
    ]).flat() });
    const path = chat(id) + "/messages?presentation=sheet";
    const latest = value(await request(b, path));
    const older = value(await request(b, path + "&before=" + latest.nextCursor));
    expect(latest.items.map((row: { text: string }) => row.text)).toEqual(Array.from({ length: 30 }, (_, i) => `Ordinary ${i + 7}`));
    expect(older.items.map((row: { text: string }) => row.text)).toEqual([`Suggested date spot: ${venue.name}`, "Suggested a date time.", ...Array.from({ length: 7 }, (_, i) => `Ordinary ${i}`)]);
    expect(older.nextCursor).toBeNull();
  });

  it("keeps history scoped to members and rejects arbitrary or forged messages", async () => {
    const { a, b, id, propose, action, calendar } = await fixture();
    const other = await fixture();
    expect((await other.action(other.a, propose())).statusCode).toBe(404);
    expect((await request(other.b, plans(id))).statusCode).toBe(404);
    expect((await request(a, plans(id), propose(), { "x-messaging-owner": b.id })).statusCode).toBe(409);
    expect((await request(a, plans(id), propose(), { origin: "https://other.example.test" })).statusCode).toBe(403);
    const text = "Suggested date spot: Untrusted";
    expect((await request(a, chat(id) + "/messages", { text, requestId: randomUUID(), datePlanEvent: {} })).statusCode).toBe(400);
    const plain = value(await request(a, chat(id) + "/messages", { text, requestId: randomUUID() }));
    expect((await action(a, { ...propose(), sourceMessageId: plain.id })).statusCode).toBe(404);
    const { activePlan, message } = value(await action(a, propose()));
    expect(message.datePlanEvent).not.toHaveProperty("fingerprint");
    expect(message.datePlanEvent).not.toHaveProperty("proposer");
    expect((await calendar(other.a, activePlan.id)).statusCode).toBe(404);
    process.env.DATE_PLANS_ENABLED = "false";
    try {
      expect(value(await request(a, chat(id)))).not.toHaveProperty("datePlansConversationId");
      expect((await request(a, plans(id))).statusCode).toBe(404);
      expect(value(await request(b, chat(id) + "/messages")).items.at(-1)).toMatchObject({ id: message.id, text: message.text });
      expect(value(await request(b, chat(id) + "/messages")).items.at(-1)).not.toHaveProperty("datePlanEvent");
      value(await request(b, chat(id) + "/messages", { text: "Ordinary chat", requestId: randomUUID() }));
    } finally { process.env.DATE_PLANS_ENABLED = "true"; }
    const confirmed = value(await action(b, change("confirm", activePlan))).activePlan;
    value(await request(b, chat(id) + "/block", {}));
    expect((await calendar(a, confirmed.id)).statusCode).toBe(404);
    expect((await action(a, change("cancel", confirmed))).statusCode).toBe(404);
    value(await request(other.b, chat(other.id) + "/close", {}));
    expect((await other.action(other.a, other.propose())).statusCode).toBe(404);
  });

  it("can plan and cancel with search disabled in both chat types", async () => {
    for (const discovery of [false, true]) {
      const { a, b, id, propose, action, f } = await fixture(discovery);
      process.env.DATE_SPOTS_ENABLED = "false";
      try {
        const route = discovery ? await f.request(a, "GET", "/api/discovery/connections/" + id) : await request(a, chat(id));
        expect(value(route)).toHaveProperty("datePlansConversationId", id);
        expect(value(route)).not.toHaveProperty("dateSpotsConversationId");
        const { activePlan } = value(await action(b, propose()));
        const confirmed = value(await action(a, change("confirm", activePlan))).activePlan;
        expect(value(await action(b, change("cancel", confirmed))).activePlan).toBeNull();
      } finally { process.env.DATE_SPOTS_ENABLED = "true"; }
    }
  });

  it("deduplicates exact retries, enforces future time, and leaves state unchanged on a failed append", async () => {
    const { a, b, id, propose, action, calendar } = await fixture();
    expect((await action(a, propose(time(-1)))).statusCode).toBe(400);
    const proposal = propose();
    const first = value(await action(a, proposal));
    expect(value(await action(a, proposal)).message.id).toBe(first.message.id);
    expect((await action(a, { ...proposal, time: time(6) })).statusCode).toBe(409);
    const next = change("counter", first.activePlan, { time: time(5) });
    const day = 86_400_000;
    await prisma.discoveryThrottle.create({ data: { userId: b.id, action: "chat:" + day, windowStart: new Date(Math.floor(Date.now() / day) * day), count: 300 } });
    expect((await action(b, next)).statusCode).toBe(429);
    expect(value(await request(b, plans(id))).activePlan).toMatchObject({ revision: 1, startsAt: proposal.time.startsAt });
    await prisma.discoveryThrottle.deleteMany({ where: { userId: b.id } });
    value(await action(b, change("confirm", first.activePlan)));
    await prisma.chatDatePlan.update({ where: { id: first.activePlan.id }, data: { startsAt: new Date(Date.now() - 1000) } });
    expect((await calendar(b, first.activePlan.id)).statusCode).toBe(404);
    const { activePlan } = value(await action(b, propose()));
    expect(activePlan.id).not.toBe(first.activePlan.id);
    await prisma.chatDatePlan.update({ where: { id: activePlan.id }, data: { startsAt: new Date(Date.now() - 1000) } });
    expect((await action(a, change("confirm", activePlan))).statusCode).toBe(409);
    expect(value(await action(a, propose())).activePlan.id).not.toBe(activePlan.id);
  });

  it("uses ordinary unread preferences without exposing plan details", async () => {
    const { a, b, id, propose, action } = await fixture();
    const earlier = value(await request(b, chat(id) + "/messages")).items.at(-1);
    value(await request(b, chat(id) + "/read", { through: earlier.sequence }));
    const unread = (actor: typeof a) => request(actor, "/api/messaging/unread");
    await prisma.user.update({ where: { id: b.id }, data: { inAppActivity: false } });
    const proposed = value(await action(a, propose())).activePlan;
    expect(value(await unread(b))).toEqual({ count: 0, items: [] });
    await prisma.user.update({ where: { id: b.id }, data: { inAppActivity: true } });
    value(await action(a, change("withdraw", proposed)));
    value(await action(a, propose()));
    expect(value(await unread(b))).toEqual({ count: 1, items: [{ conversationId: id, discoveryConnectionId: null }] });
    expect(value(await unread(a))).toEqual({ count: 0, items: [] });
  });

  it("reports only the visible details of the selected historical proposal in both chat types", async () => {
    for (const discovery of [false, true]) {
      const { a, b, id, propose, action, f } = await fixture(discovery);
      const selected = time();
      const { activePlan, message } = value(await action(b, propose(selected)));
      value(await action(a, change("counter", activePlan, { time: time(5) })));
      const report = { reason: "OTHER", requestId: randomUUID() };
      const result = discovery
        ? await f.request(a, "POST", "/api/discovery/reports", { ...report, sourceType: "MESSAGE", sourceId: message.id })
        : await request(a, chat(id) + "/reports", { ...report, messageId: message.id });
      const { evidence } = await prisma.discoveryReport.findUniqueOrThrow({ where: { id: value(result).id } });
      expect(evidence).toMatchObject({ text: "Suggested a date time.", datePlan: {
        action: "propose", venueName: venue.name, startsAt: selected.startsAt, timeZone: selected.timeZone,
      } });
      expect(JSON.stringify(evidence)).not.toMatch(/fingerprint|sourceMessageId|revision|Private starting area/);
    }
  });
});
