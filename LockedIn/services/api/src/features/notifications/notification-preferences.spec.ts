import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: null as null | { activityEmails: boolean; inAppActivity: boolean },
}));
vi.mock("../../lib/prisma.js", () => ({
  prisma: { user: { findFirst: async () => state.user } },
}));
import {
  activityEmailAllowed,
  inAppActivityAllowed,
} from "./notification-preferences.js";
beforeEach(() => {
  state.user = null;
});
it("permits invitation email to a new account", async () =>
  expect(await activityEmailAllowed("new@example.test")).toBe(true));
it("suppresses relationship email for an opted-out recipient", async () => {
  state.user = { activityEmails: false, inAppActivity: true };
  expect(await activityEmailAllowed("existing@example.test")).toBe(false);
});
it("reads in-app preference independently", async () => {
  const tx = { user: { findUnique: async () => ({ inAppActivity: false }) } };
  expect(await inAppActivityAllowed(tx, "owner")).toBe(false);
});
