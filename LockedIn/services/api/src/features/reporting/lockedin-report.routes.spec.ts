import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { lockedInReportPath, lockedInReportProtocol } from "./lockedin-report-protocol.js";
import { registerLockedInReport } from "./lockedin-report.routes.js";
import { signTogetherReport, togetherReportPath } from "./together-report-protocol.js";
import { productionLockedInReportKey, productionTogetherReportKey } from "./together-report.production.js";
import { registerTogetherReport } from "./together-report.routes.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const now = 1_800_000_000;
const week = "2026-11-16";
const target = lockedInReportPath + "?week=" + week;
const header = (path = target, time = now) => ({ authorization: lockedInReportProtocol.sign(privateKey, path, time) });
const totals = {
  weekStart: week, weekEndExclusive: "2026-11-23", timeZone: "UTC",
  firstChatsReady: true, repeatChatsReady: true,
  accounts: { signups: 15, verifiedAccounts: 10 },
  discover: { acceptedInvites: 20, firstTwoWayChats: 15, repeatTwoWayChats: 5 },
  directInvites: { acceptedInvites: null, firstTwoWayChats: null, repeatTwoWayChats: null },
};

describe("protected weekly LockedIn report", () => {
  it("is off by default and requires a separate key in the intended production API", () => {
    const prod = { RENDER: "true", RENDER_SERVICE_ID: "srv-dbsr5j6i0phs73dtrkq0", RENDER_GIT_BRANCH: "production" };
    const encoded = publicKey.export({ format: "der", type: "spki" }).toString("base64");
    expect(productionLockedInReportKey(prod)).toBeNull();
    expect(productionLockedInReportKey({ ...prod, LOCKEDIN_REPORT_PUBLIC_KEY: encoded })).toBeNull();
    const enabled = { ...prod, LOCKEDIN_REPORT_HTTPS_ENABLED: "true" };
    expect(productionLockedInReportKey(enabled)).toBeNull();
    expect(productionLockedInReportKey({ ...enabled, LOCKEDIN_REPORT_PUBLIC_KEY: "invalid" })).toBeNull();
    const configured = { ...enabled, LOCKEDIN_REPORT_PUBLIC_KEY: encoded };
    expect(productionLockedInReportKey(configured)?.equals(publicKey)).toBe(true);
    expect(productionLockedInReportKey({ ...configured, RENDER_SERVICE_ID: "unrelated" })).toBeNull();
    expect(productionLockedInReportKey({ ...configured, IS_PULL_REQUEST: "true" })).toBeNull();
    expect(productionLockedInReportKey({ ...configured, RENDER_GIT_BRANCH: "preview" })).toBeNull();
    expect(productionLockedInReportKey({ ...configured, TOGETHER_REPORT_PUBLIC_KEY: encoded })).toBeNull();
    const togetherKey = productionTogetherReportKey(prod)?.export({ format: "der", type: "spki" }).toString("base64");
    expect(togetherKey).toBeDefined();
    expect(productionLockedInReportKey({ ...configured, LOCKEDIN_REPORT_PUBLIC_KEY: togetherKey })).toBeNull();
  });

  it("does no data work when disabled, unsigned, stale, scoped to Together, or filtered by user or route", async () => {
    const off = Fastify();
    const api = Fastify();
    const readTotals = vi.fn(async () => totals);
    await off.register(registerLockedInReport, { verificationKey: null, readTotals });
    await api.register(registerLockedInReport, { verificationKey: publicKey, now: () => now, readTotals });
    try {
      expect((await off.inject({ url: target, headers: header() })).statusCode).toBe(404);
      for (const request of [
        { url: target, headers: { cookie: "normal-app-session" } },
        { url: target, headers: { authorization: signTogetherReport(privateKey, target, now) } },
        { url: target, headers: header(lockedInReportPath) },
        { url: target, headers: header(target, now - 46) },
        { url: target + "&userId=private-user", headers: header(target + "&userId=private-user") },
        { url: target + "&source=discover", headers: header(target + "&source=discover") },
        { url: lockedInReportPath + "?week=2026-11-17", headers: header(lockedInReportPath + "?week=2026-11-17") },
        { method: "HEAD" as const, url: target, headers: header() },
        { method: "POST" as const, url: target, headers: header() },
      ]) expect((await api.inject(request)).statusCode).toBe(404);
      expect(readTotals).not.toHaveBeenCalled();
    } finally {
      await Promise.all([off.close(), api.close()]);
    }
  });

  it("returns only fixed totals, never caches them, and rejects replay and unsuppressed small groups", async () => {
    const api = Fastify();
    const readTotals = vi.fn<(value: string | null) => Promise<unknown>>()
      .mockResolvedValueOnce(totals)
      .mockResolvedValueOnce({ ...totals, discover: { ...totals.discover, messageText: "private" } })
      .mockResolvedValueOnce({ ...totals, directInvites: { ...totals.directInvites, acceptedInvites: 3 } })
      .mockResolvedValueOnce({ ...totals, accounts: { signups: 7, verifiedAccounts: 6 } })
      .mockResolvedValueOnce({ ...totals, repeatChatsReady: false })
      .mockResolvedValueOnce(null);
    await api.register(registerLockedInReport, { verificationKey: publicKey, now: () => now, readTotals });
    try {
      const auth = header(lockedInReportPath);
      const first = await api.inject({ url: lockedInReportPath, headers: auth });
      expect(first.json()).toEqual(totals);
      expect(first.headers["cache-control"]).toBe("private, no-store");
      expect(first.headers.vary).toBe("Authorization");
      expect((await api.inject({ url: lockedInReportPath, headers: auth })).statusCode).toBe(404);
      for (let i = 0; i < 4; i++) {
        const failure = await api.inject({ url: target, headers: header() });
        expect(failure.statusCode).toBe(503);
        expect(failure.json()).toEqual({ code: "REPORT_UNAVAILABLE" });
      }
      const invalid = await api.inject({ url: target, headers: header() });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toEqual({ code: "REPORT_WEEK_OUT_OF_RANGE" });
      expect(readTotals).toHaveBeenNthCalledWith(1, null);
      expect(readTotals).toHaveBeenNthCalledWith(2, week);
    } finally {
      await api.close();
    }
  });

  it("preserves the original Together signing format for the installed helper", async () => {
    const api = Fastify();
    const original = { status: "insufficient_cohort", weekStart: week, weekEndExclusive: "2026-11-23", timeZone: "UTC" };
    await api.register(registerTogetherReport, { verificationKey: publicKey, now: () => now, readTotals: async () => original });
    try {
      const nonce = randomBytes(16).toString("base64url");
      const payload = Buffer.from(["lockedin.together-report.v1", "https://lockedin-9yon.onrender.com", "GET", togetherReportPath, now, nonce].join("\n"));
      const signature = sign(null, payload, privateKey).toString("base64url");
      const previousHelper = "LockedInReportV1 " + [now, nonce, signature].join(".");
      expect((await api.inject({ url: togetherReportPath, headers: { authorization: previousHelper } })).json()).toEqual(original);
      expect((await api.inject({ url: togetherReportPath, headers: header(togetherReportPath) })).statusCode).toBe(404);
    } finally {
      await api.close();
    }
  });
});
