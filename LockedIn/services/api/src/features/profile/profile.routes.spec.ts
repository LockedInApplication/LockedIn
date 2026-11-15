import Fastify from "fastify";
import { beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null,
  row: {} as Record<string, unknown>,
}));
vi.mock("../../lib/session.js", () => ({
  getAuthenticatedUser: async () => fake.user,
}));
vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        if (where.id !== "owner") throw Error("wrong owner");
        return fake.row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        if (where.id !== "owner") throw Error("wrong owner");
        Object.assign(fake.row, data);
        return fake.row;
      },
    },
  },
}));
import { registerProfileRoutes } from "./profile.routes.js";
beforeEach(() => {
  fake.user = { id: "owner" };
  fake.row = {
    id: "owner",
    email: "owner@example.test",
    emailVerified: false,
    name: "Original",
    displayName: null,
    avatarPreset: "initials",
    activityEmails: true,
    inAppActivity: true,
  };
});
async function request(
  method: "GET" | "PUT",
  url = "/api/profile",
  payload?: Record<string, unknown>,
  origin = "http://localhost:3001",
) {
  const app = Fastify();
  await registerProfileRoutes(app);
  try {
    return await app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { origin },
    });
  } finally {
    await app.close();
  }
}
it("requires sign in", async () => {
  fake.user = null;
  expect((await request("GET")).statusCode).toBe(401);
});
it("returns only private account fields with no-store", async () => {
  fake.row.password = "secret";
  const r = await request("GET");
  expect(r.statusCode).toBe(200);
  expect(r.json()).toEqual({
    id: "owner",
    email: "owner@example.test",
    emailVerified: false,
    displayName: "Original",
    avatarPreset: "initials",
    activityEmails: true,
    inAppActivity: true,
  });
  expect(r.headers["cache-control"]).toContain("no-store");
});
it("persists trimmed name and preset for session owner", async () => {
  expect(
    (
      await request("PUT", "/api/profile/details", {
        displayName: "  New Name  ",
        avatarPreset: "sun",
      })
    ).statusCode,
  ).toBe(200);
  expect((await request("GET")).json().displayName).toBe("New Name");
});
it.each([
  { displayName: " ", avatarPreset: "sun" },
  { displayName: "a".repeat(81), avatarPreset: "sun" },
  { displayName: "Name", avatarPreset: "https://tracker.test/a" },
  { displayName: "Name", avatarPreset: "sun", id: "other" },
  { displayName: "Name", avatarPreset: "sun", email: "other@example.test" },
])("rejects invalid or unsupported details %j", async (payload) => {
  expect(
    (await request("PUT", "/api/profile/details", payload)).statusCode,
  ).toBe(400);
});
it("persists independent boolean preferences", async () => {
  await request("PUT", "/api/profile/notifications", {
    activityEmails: false,
    inAppActivity: true,
  });
  expect((await request("GET")).json()).toMatchObject({
    activityEmails: false,
    inAppActivity: true,
  });
});
it("rejects non-boolean preferences", async () => {
  expect(
    (
      await request("PUT", "/api/profile/notifications", {
        activityEmails: "false",
        inAppActivity: true,
      })
    ).statusCode,
  ).toBe(400);
});
it("rejects cross-origin writes", async () => {
  expect(
    (
      await request(
        "PUT",
        "/api/profile/details",
        { displayName: "Name", avatarPreset: "sun" },
        "https://evil.test",
      )
    ).statusCode,
  ).toBe(403);
});
it("rejects a form from an account that is no longer signed in", async () => {
  const app = Fastify();
  await registerProfileRoutes(app);
  try {
    const r = await app.inject({
      method: "PUT",
      url: "/api/profile/details",
      headers: {
        origin: "http://localhost:3001",
        "x-profile-owner": "previous-account",
      },
      payload: { displayName: "Wrong", avatarPreset: "sun" },
    });
    expect(r.statusCode).toBe(409);
  } finally {
    await app.close();
  }
});
