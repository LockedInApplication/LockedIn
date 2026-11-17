import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectionFixtures } from "./discovery-connection.fixtures.js";

vi.mock("../../../lib/email.js", () => ({ sendEmail: async () => {}, sendPasswordResetEmail: async () => {} }));
vi.mock("../../journey-notifications/journey-email.service.js", () => ({ sendJourneyEmailSafely: async () => {} }));

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("Discovery private text chat", () => {
  let app: Awaited<ReturnType<typeof import("../../../app.js").buildServer>>;
  let f: ReturnType<typeof connectionFixtures>;
  const oldEnv = { ...process.env };
  beforeAll(async () => {
    process.env.DISCOVERY_CHAT_ENABLED = "true";
    app = await (await import("../../../app.js")).buildServer();
    await app.listen({ port: 0, host: "127.0.0.1" });
    f = connectionFixtures(app);
  });
  afterAll(async () => {
    process.env = oldEnv;
    await app?.close();
    await (await import("../../../lib/prisma.js")).prisma.$disconnect();
  });

  async function thread() {
    const a = await f.person(), b = await f.person();
    const pending = await f.send(a, b);
    expect(pending.statusCode).toBe(200);
    const base = `/api/discovery/connections/${pending.json().value.id}`;
    return { a, b, base, messages: `${base}/messages`, id: pending.json().value.id as string };
  }

  it("requires mutual acceptance, persists exactly once per retry and emits a content-free signal", async () => {
    const { a, b, base, messages } = await thread(), other = await f.person();
    const input = { text: "Hello privately", requestId: randomUUID() };
    expect((await app.inject({ url: messages })).statusCode).toBe(401);
    expect((await f.request(a, "POST", messages, input)).statusCode).toBe(404);
    expect((await f.request(b, "POST", `${base}/accept`, {})).statusCode).toBe(200);
    expect((await f.request(other, "GET", messages)).statusCode).toBe(404);
    expect((await f.request(other, "POST", messages, input)).statusCode).toBe(404);
    expect((await f.request(a, "POST", messages, { ...input, senderId: b.id })).statusCode).toBe(400);
    const { notificationBroker } = await import("../../notifications/notification.broker.js");
    const update = vi.fn();
    const unsubscribe = notificationBroker.subscribe(b.id, update);
    try {
      const results = await Promise.all([f.request(a, "POST", messages, input), f.request(a, "POST", messages, input)]);
      expect(results.map(response => response.statusCode)).toEqual([200, 200]);
      expect(results[0]!.json()).toEqual(results[1]!.json());
      expect(update.mock.calls).toEqual([[false, "chat"]]);
      expect((await f.request(a, "POST", messages, { ...input, text: "Different text" })).statusCode).toBe(409);
      const fresh = await f.request(b, "GET", messages);
      expect(fresh.headers["cache-control"]).toBe("private, no-store");
      expect(fresh.json().value.items).toEqual([{ ...results[0]!.json().value, author: "partner" }]);
      expect(fresh.json().value.items[0]).not.toHaveProperty("senderId");
    } finally { unsubscribe?.(); }
  });

  it("pages missed messages, denies expired access and records only the selected partner message as evidence", async () => {
    const { a, b, base, messages, id } = await thread(), other = await f.person();
    expect((await f.request(b, "POST", `${base}/accept`, {})).statusCode).toBe(200);
    const { prisma } = await import("../../../lib/prisma.js");
    await prisma.discoveryMessage.createMany({ data: Array.from({ length: 31 }, (_v, i) => ({
      connectionId: id, senderId: a.id, requestId: randomUUID(), text: `Saved message ${i}`,
    })) });
    const latest = (await f.request(b, "GET", messages)).json().value;
    expect(latest.items).toHaveLength(30);
    expect(latest.items[0].text).toBe("Saved message 1");
    const older = (await f.request(b, "GET", `${messages}?before=${latest.nextCursor}`)).json().value;
    expect(older.items).toHaveLength(1);
    expect(older.items[0].text).toBe("Saved message 0");
    expect(older.nextCursor).toBeNull();
    expect((await f.request(b, "GET", `${messages}?before=9999999999999999999`)).statusCode).toBe(400);
    const report = { sourceType: "MESSAGE", sourceId: older.items[0].id, reason: "SPAM", requestId: randomUUID() };
    expect((await f.request(a, "POST", "/api/discovery/reports", report)).statusCode).toBe(404);
    expect((await f.request(other, "POST", "/api/discovery/reports", report)).statusCode).toBe(404);
    expect((await f.request(b, "POST", "/api/discovery/blocks", { connectionId: id })).statusCode).toBe(200);
    expect((await f.request(a, "GET", messages)).statusCode).toBe(404);
    expect((await f.request(b, "POST", messages, { text: "No", requestId: randomUUID() })).statusCode).toBe(404);
    const receipt = await f.request(b, "POST", "/api/discovery/reports", report);
    expect(receipt.statusCode).toBe(200);
    expect((await prisma.discoveryReport.findUniqueOrThrow({ where: { id: receipt.json().value.id } })).evidence).toMatchObject({ text: "Saved message 0" });
  });

  it("keeps the API unavailable until the chat flag is on", async () => {
    const { a, b, base, messages } = await thread();
    expect((await f.request(b, "POST", `${base}/accept`, {})).statusCode).toBe(200);
    process.env.DISCOVERY_CHAT_ENABLED = "false";
    try {
      expect((await f.request(a, "GET", "/api/discovery/me")).json().value.chatEnabled).toBe(false);
      expect((await f.request(a, "GET", messages)).statusCode).toBe(404);
      expect((await f.request(a, "POST", messages, { text: "No", requestId: randomUUID() })).statusCode).toBe(404);
    } finally { process.env.DISCOVERY_CHAT_ENABLED = "true"; }
  });

  it("enforces input, origin and owner checks, throttles spam and refuses closed or suspended contact", async () => {
    const { a, b, base, messages } = await thread();
    await f.request(b, "POST", `${base}/accept`, {});
    const input = { text: "Message", requestId: randomUUID() };
    for (const text of [" ", "x".repeat(2001)]) {
      expect((await f.request(a, "POST", messages, { ...input, text })).statusCode).toBe(400);
    }
    for (const [headers, status] of [
      [{ origin: "https://not-lockedin.test", "x-discovery-owner": a.id }, 403],
      [{ origin: "http://localhost:3001", "x-discovery-owner": b.id }, 409],
    ] as const) {
      expect((await app.inject({ method: "POST", url: messages, headers: { ...headers, cookie: a.cookie }, payload: input })).statusCode).toBe(status);
    }
    const { prisma } = await import("../../../lib/prisma.js");
    const windowStart = new Date(Math.floor(Date.now() / 60000) * 60000);
    await prisma.discoveryThrottle.create({ data: { userId: a.id, action: "chat:60000", windowStart, count: 20 } });
    const throttled = await f.request(a, "POST", messages, input);
    expect(throttled.statusCode).toBe(429);
    expect(Number(throttled.headers["retry-after"])).toBeGreaterThan(0);
    await prisma.discoveryProfile.update({ where: { ownerId: b.id }, data: { suspendedAt: new Date() } });
    expect((await f.request(a, "GET", messages)).statusCode).toBe(404);
    await prisma.discoveryProfile.update({ where: { ownerId: b.id }, data: { suspendedAt: null } });
    await f.request(b, "POST", `${base}/close`, {});
    expect((await f.request(b, "GET", messages)).statusCode).toBe(404);
    expect((await f.request(b, "POST", messages, input)).statusCode).toBe(404);
  });

  it("delivers a live SSE signal without exposing message text", async () => {
    const { a, b, base, messages } = await thread();
    await f.request(b, "POST", `${base}/accept`, {});
    const address = app.server.address();
    if (!address || typeof address === "string") throw Error("Local test server missing");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const stream = await fetch(`http://127.0.0.1:${address.port}/api/journey/notifications/stream`, {
      headers: { cookie: b.cookie }, signal: controller.signal,
    });
    const reader = stream.body!.getReader(), decoder = new TextDecoder();
    try {
      expect(stream.status).toBe(200);
      await reader.read(); // Initial notification sync.
      expect((await f.request(a, "POST", messages, { text: "Secret test text", requestId: randomUUID() })).statusCode).toBe(200);
      const signal = decoder.decode((await reader.read()).value);
      expect(signal).toContain("event: discovery-chat-changed");
      expect(signal).not.toContain("Secret test text");
    } finally { clearTimeout(timer); controller.abort(); await reader.cancel().catch(() => {}); }
  });
});
