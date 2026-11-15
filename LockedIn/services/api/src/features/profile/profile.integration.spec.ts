import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
const mail = vi.hoisted(() => ({ activity: vi.fn(), security: vi.fn() }));
vi.mock("../../lib/email.js", () => ({
  sendJourneyNotificationEmail: mail.activity,
  sendEmail: mail.security,
  sendPasswordResetEmail: mail.security,
}));
describe.skipIf(process.env.NOTIFICATIONS_INTEGRATION !== "true")(
  "private profile database and auth integration",
  () => {
    let db: typeof import("../../lib/prisma.js").prisma;
    let app: Awaited<ReturnType<typeof import("../../app.js").buildServer>>;
    let base: string, cookieA: string, cookieB: string, relationshipId: string;
    const origin = "http://localhost:3001";
    const cookie = (id: string) => {
      const token = `token-${id}`;
      return `better-auth.session_token=${encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64")}`)}`;
    };
    beforeAll(async () => {
      ({ prisma: db } = await import("../../lib/prisma.js"));
      app = await (await import("../../app.js")).buildServer();
      base = await app.listen({ port: 0, host: "127.0.0.1" });
      for (const id of ["profile-a", "profile-b", "profile-c"]) {
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
            id: `session-${id}`,
            userId: id,
            token: `token-${id}`,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
      }
      cookieA = cookie("profile-a");
      cookieB = cookie("profile-b");
      relationshipId = (
        await db.relationship.create({
          data: {
            members: {
              create: [{ userId: "profile-a" }, { userId: "profile-b" }],
            },
          },
        })
      ).id;
    });
    afterAll(async () => {
      await app?.close();
      await db?.$disconnect();
    });
    const get = (path: string, cookieValue = cookieA) =>
      app.inject({
        method: "GET",
        url: path,
        headers: { cookie: cookieValue, origin },
      });
    const put = (
      path: string,
      payload: Record<string, unknown>,
      cookieValue = cookieA,
    ) =>
      app.inject({
        method: "PUT",
        url: path,
        payload,
        headers: { cookie: cookieValue, origin },
      });
    it("preserves old accounts by default and updates only the session owner", async () => {
      expect((await get("/api/profile")).json()).toMatchObject({
        id: "profile-a",
        avatarPreset: "initials",
        activityEmails: true,
        inAppActivity: true,
      });
      expect(
        (
          await put("/api/profile/details", {
            displayName: "  Preferred A ",
            avatarPreset: "sun",
          })
        ).statusCode,
      ).toBe(200);
      expect((await get("/api/profile")).json()).toMatchObject({
        displayName: "Preferred A",
        avatarPreset: "sun",
      });
      expect((await get("/api/profile", cookieB)).json().displayName).toBe(
        "profile-b",
      );
      expect(
        (
          await put("/api/profile/details", {
            id: "profile-b",
            displayName: "Wrong",
            avatarPreset: "sun",
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (await app.inject({ method: "GET", url: "/api/profile" })).statusCode,
      ).toBe(401);
    });
    it("shares only preferred identity through partner overview", async () => {
      const overview = (await get("/api/journey/overview", cookieB)).json();
      expect(overview.relationship.partner).toMatchObject({
        name: "Preferred A",
        avatarPreset: "sun",
      });
      expect(overview.relationship.partner).not.toHaveProperty(
        "activityEmails",
      );
    });
    it("suppresses activity per recipient but still emits quiet SSE invalidation", async () => {
      await put("/api/profile/notifications", {
        activityEmails: false,
        inAppActivity: false,
      });
      const controller = new AbortController();
      const stream = await fetch(`${base}/api/journey/notifications/stream`, {
        headers: { cookie: cookieA },
        signal: controller.signal,
      });
      const reader = stream.body!.getReader();
      await reader.read();
      const { withNotifications } =
        await import("../notifications/notification.service.js");
      await withNotifications(relationshipId, "profile-b", (tx) =>
        tx.meaningChapter.create({
          data: {
            relationshipId,
            createdById: "profile-b",
            wordKey: "support",
          },
        }),
      );
      const event = new TextDecoder().decode((await reader.read()).value);
      expect(event).toContain('"activity":false');
      controller.abort();
      await reader.cancel().catch(() => {});
      const own = (await get("/api/journey/notifications")).json(),
        other = (await get("/api/journey/notifications", cookieB)).json();
      expect(own.items).toHaveLength(0);
      expect(own.unreadCount).toBe(0);
      expect(other.items.length).toBeGreaterThan(0);
      await put("/api/profile/notifications", {
        activityEmails: false,
        inAppActivity: true,
      });
      expect(
        (await get("/api/journey/notifications")).json().items,
      ).toHaveLength(0);
    });
    it("does not backfill an invitation suppressed while opted out", async () => {
      await put("/api/profile/notifications", {
        activityEmails: false,
        inAppActivity: false,
      });
      const { createInvitation } =
        await import("../invitations/invitation.service.js");
      // Third user has no active relationship, so sending to A is allowed for review.
      const invite = await createInvitation(
        "profile-c",
        "profile-a@example.test",
      );
      expect(invite.ok).toBe(true);
      await get("/api/journey/notifications");
      await put("/api/profile/notifications", {
        activityEmails: true,
        inAppActivity: true,
      });
      const inbox = (await get("/api/journey/notifications")).json();
      expect(
        inbox.items.some(
          (x: { kind: string }) => x.kind === "INVITATION_RECEIVED",
        ),
      ).toBe(false);
      expect(
        (await get("/api/journey/overview")).json().pendingInvites,
      ).toHaveLength(1);
    });
    it("keeps previous visible alerts after preferences change", async () => {
      const before = (await get("/api/journey/notifications", cookieB)).json();
      await put(
        "/api/profile/notifications",
        { activityEmails: true, inAppActivity: false },
        cookieB,
      );
      expect(
        (await get("/api/journey/notifications", cookieB)).json().items,
      ).toEqual(before.items);
    });
    it("applies email preference to activity only and allows new-user invitations", async () => {
      const { sendJourneyEmailSafely } =
        await import("../journey-notifications/journey-email.service.js");
      const { sendPasswordResetEmail } = await import("../../lib/email.js");
      await put("/api/profile/notifications", {
        activityEmails: false,
        inAppActivity: true,
      });
      mail.activity.mockClear();
      mail.security.mockClear();
      const args = {
        to: "profile-a@example.test",
        subject: "Update",
        heading: "Update",
        message: "Update",
        actionLabel: "Open",
        url: origin,
      };
      const request = { log: { warn: () => {} } } as unknown as Parameters<
        typeof sendJourneyEmailSafely
      >[0];
      await sendJourneyEmailSafely(request, args);
      expect(mail.activity).not.toHaveBeenCalled();
      await sendJourneyEmailSafely(request, {
        ...args,
        to: "new-person@example.test",
      });
      expect(mail.activity).toHaveBeenCalledTimes(1);
      await sendPasswordResetEmail({ user: { email: args.to }, url: origin });
      expect(mail.security).toHaveBeenCalledTimes(1);
    });
    it("uses real auth password validation and rotates all previous sessions", async () => {
      const signup = await app.inject({
        method: "POST",
        url: "/api/auth/sign-up/email",
        headers: { origin, host: "localhost:8000" },
        payload: {
          email: "profile-password@example.test",
          name: "Password Test",
          password: "old-password-123",
        },
      });
      expect(signup.statusCode).toBe(200);
      const raw = String(signup.headers["set-cookie"]);
      const initial = raw.match(/better-auth.session_token=([^;]+)/)?.[0];
      expect(initial).toBeTruthy();
      const stale = await app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: {
          origin,
          host: "localhost:8000",
          cookie: initial!,
          "x-profile-owner": "previous-account",
        },
        payload: {
          currentPassword: "old-password-123",
          newPassword: "new-password-123",
          revokeOtherSessions: true,
        },
      });
      expect(stale.statusCode).toBe(409);
      const owner = await db.user.findUniqueOrThrow({
        where: { email: "profile-password@example.test" },
      });
      await db.session.create({
        data: {
          id: "profile-password-second-session",
          userId: owner.id,
          token: "second-password-session",
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      const change = (currentPassword: string) =>
        app.inject({
          method: "POST",
          url: "/api/auth/change-password",
          headers: { origin, host: "localhost:8000", cookie: initial! },
          payload: {
            currentPassword,
            newPassword: "new-password-123",
            revokeOtherSessions: true,
          },
        });
      expect((await change("incorrect-password")).statusCode).toBe(400);
      expect(await db.session.count({ where: { userId: owner.id } })).toBe(2);
      const changed = await change("old-password-123");
      expect(changed.statusCode).toBe(200);
      expect(await db.session.count({ where: { userId: owner.id } })).toBe(1);
      expect((await get("/api/profile", initial!)).statusCode).toBe(401);
      const rotated = String(changed.headers["set-cookie"]).match(
        /better-auth.session_token=([^;]+)/,
      )?.[0];
      expect((await get("/api/profile", rotated!)).statusCode).toBe(200);
    });
    it("acceptance sends quiet invalidation to an opted-out inviter", async () => {
      for (const id of ["profile-inviter", "profile-recipient"])
        await db.user.create({
          data: {
            id,
            email: `${id}@example.test`,
            name: id,
            inAppActivity: id !== "profile-inviter",
          },
        });
      const { createInvitation, acceptInvitation } =
        await import("../invitations/invitation.service.js");
      const { notificationBroker } =
        await import("../notifications/notification.broker.js");
      const result = await createInvitation(
        "profile-inviter",
        "profile-recipient@example.test",
      );
      if (!result.ok) throw Error("fixture invite failed");
      const events: boolean[] = [];
      const stop = notificationBroker.subscribe("profile-inviter", (activity) =>
        events.push(activity),
      );
      try {
        expect(
          (
            await acceptInvitation(
              result.invite.id,
              "profile-inviter",
              "profile-recipient",
            )
          ).ok,
        ).toBe(true);
        expect(events).toEqual([false]);
      } finally {
        stop?.();
      }
    });
    it("drains all legacy invite batches under the disabled preference before re-enable", async () => {
      await db.user.create({
        data: {
          id: "profile-legacy",
          name: "Legacy",
          email: "profile-legacy@example.test",
          inAppActivity: false,
        },
      });
      await db.session.create({
        data: {
          id: "session-profile-legacy",
          userId: "profile-legacy",
          token: "token-profile-legacy",
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      await db.relationshipInvite.createMany({
        data: Array.from({ length: 103 }, (_, i) => ({
          inviterId: "profile-c",
          inviteeEmail: "profile-legacy@example.test",
          token: `legacy-profile-${i}`,
          expiresAt: new Date(Date.now() + 86400000),
        })),
      });
      expect(
        (
          await put(
            "/api/profile/notifications",
            { activityEmails: true, inAppActivity: true },
            cookie("profile-legacy"),
          )
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await get("/api/journey/notifications", cookie("profile-legacy"))
        ).json().items,
      ).toHaveLength(0);
      expect(
        await db.notification.count({
          where: { recipientId: "profile-legacy", suppressed: true },
        }),
      ).toBe(103);
    });
  },
);
