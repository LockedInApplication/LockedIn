import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
vi.mock("../journey-notifications/journey-email.service.js", () => ({
  sendJourneyEmailSafely: async () => {},
}));
describe.skipIf(process.env.NOTIFICATIONS_INTEGRATION !== "true")(
  "conversation suggestion database integration",
  () => {
    let db: typeof import("../../lib/prisma.js").prisma,
      app: Awaited<ReturnType<typeof import("../../app.js").buildServer>>,
      pair: string,
      notificationId: string;
    const cookie = (id: string) =>
      `better-auth.session_token=${encodeURIComponent(`suggest-${id}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(`suggest-${id}`).digest("base64")}`)}`;
    beforeAll(async () => {
      ({ prisma: db } = await import("../../lib/prisma.js"));
      app = await (await import("../../app.js")).buildServer();
      for (const id of ["suggest-a", "suggest-b", "suggest-c"]) {
        await db.user.create({
          data: {
            id,
            email: `${id}@example.test`,
            name: id,
            emailVerified: true,
          },
        });
        await db.session.create({
          data: {
            id,
            token: `suggest-${id}`,
            userId: id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
      }
      pair = (
        await db.relationship.create({
          data: {
            members: {
              create: [{ userId: "suggest-a" }, { userId: "suggest-b" }],
            },
          },
        })
      ).id;
    });
    afterAll(async () => {
      await app?.close();
      await db?.$disconnect();
    });
    const request = (
      url: string,
      method: "GET" | "POST" = "GET",
      user = "suggest-b",
      payload?: object,
    ) =>
      app.inject({
        url,
        method,
        headers: { cookie: cookie(user), origin: "http://localhost:3001" },
        payload,
      });
    const choose = (key: string) =>
      request(
        `/api/journey/relationships/${pair}/conversation-choice`,
        "POST",
        "suggest-a",
        { packKey: key },
      );
    const latest = async () =>
      String(
        (
          await db.notification.findFirstOrThrow({
            where: {
              relationshipId: pair,
              recipientId: "suggest-b",
              kind: "CONVERSATION_CHOICE",
              resolvedAt: null,
            },
            orderBy: { id: "desc" },
          })
        ).id,
      );
    const path = () =>
      `/api/journey/notifications/${notificationId}/conversation-suggestion`;
    it("opens privately without recording a response and hides foreign notifications", async () => {
      expect((await choose("direction")).statusCode).toBe(200);
      notificationId = await latest();
      expect((await request(path())).json()).toMatchObject({
        status: "pending",
        pack: { key: "direction" },
      });
      expect(
        await db.conversationChoice.count({
          where: { relationshipId: pair, userId: "suggest-b" },
        }),
      ).toBe(0);
      expect((await request(path(), "GET", "suggest-c")).statusCode).toBe(404);
    });
    it("rejects the old notification after a replacement, without any acceptance write", async () => {
      await choose("connection");
      expect((await request(path(), "POST")).statusCode).toBe(409);
      expect(
        await db.conversationChoice.count({
          where: { relationshipId: pair, userId: "suggest-b" },
        }),
      ).toBe(0);
    });
    it("starts exactly one session when the live suggestion is explicitly accepted", async () => {
      notificationId = await latest();
      expect((await request(path(), "POST")).statusCode).toBe(201);
      expect(
        await db.intentionSession.count({ where: { relationshipId: pair } }),
      ).toBe(1);
      expect((await request(path(), "POST")).statusCode).toBe(409);
      expect(
        await db.intentionSession.count({ where: { relationshipId: pair } }),
      ).toBe(1);
    });
  },
);
