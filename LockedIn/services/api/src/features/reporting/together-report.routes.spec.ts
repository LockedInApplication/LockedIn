import { generateKeyPairSync } from "node:crypto";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { productionTogetherReportKey } from "./together-report.production.js";
import { signTogetherReport, togetherReportPath } from "./together-report-protocol.js";
import { registerTogetherReport } from "./together-report.routes.js";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const now = 1_800_000_000;
const week = "2026-11-16";
const target = togetherReportPath + "?week=" + week;
const small = { status: "insufficient_cohort", weekStart: week, weekEndExclusive: "2026-11-23", timeZone: "UTC" };
const totals = {
  ...small, status: "ok", enrolledPairs: 5, pairsWithSharedAction: 2, plansProposed: 5, plansAccepted: 3,
  plansMarkedDone: 2, savedMemories: 2, memoriesWithBothPeople: 1,
  repeatMemories: { status: "insufficient_follow_up" },
};
const proof = (path: string, time = now) => signTogetherReport(privateKey, path, time);

describe("protected Together report", () => {
  it("refuses every unsigned or mis-scoped request before doing any database work", async () => {
    const api = Fastify();
    const readTotals = vi.fn(async () => totals);
    await api.register(registerTogetherReport, { verificationKey: publicKey, now: () => now, readTotals });
    const wrongKey = generateKeyPairSync("ed25519").privateKey;
    try {
      const requests = [
        { url: target, headers: { cookie: "unrelated-user-session" } },
        { url: target, headers: { authorization: "Bearer an-unrelated-key" } },
        { url: target, headers: { authorization: signTogetherReport(wrongKey, target, now) } },
        { url: target, headers: { authorization: proof(target, now - 46) } },
        { url: target, headers: { authorization: proof(target, now + 11) } },
        { url: target, headers: { authorization: proof(togetherReportPath) } },
        { url: target + "&pair=any-id", headers: { authorization: proof(target + "&pair=any-id") } },
        { url: target + "&week=" + week, headers: { authorization: proof(target + "&week=" + week) } },
        { url: togetherReportPath + "?week=2026-11-17", headers: { authorization: proof(togetherReportPath + "?week=2026-11-17") } },
        { method: "HEAD" as const, url: target, headers: { authorization: proof(target) } },
        { method: "POST" as const, url: target, headers: { authorization: proof(target) } },
      ];
      for (const request of requests) {
        const result = await api.inject(request);
        expect(result.statusCode).toBe(404);
        expect(result.body).not.toContain("plansProposed");
      }
      expect(readTotals).not.toHaveBeenCalled();
    } finally {
      await api.close();
    }
  });

  it("returns only uncached totals, accepts the default week, and rejects a reused proof", async () => {
    const api = Fastify();
    const readTotals = vi.fn<(week: string | null) => Promise<unknown>>(async value => value ? totals : small);
    await api.register(registerTogetherReport, { verificationKey: publicKey, now: () => now, readTotals });
    try {
      const auth = proof(target);
      const response = await api.inject({ url: target, headers: { authorization: auth } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(totals);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.headers.vary).toBe("Authorization");
      expect((await api.inject({ url: target, headers: { authorization: auth } })).statusCode).toBe(404);
      const latest = await api.inject({ url: togetherReportPath, headers: { authorization: proof(togetherReportPath) } });
      expect(latest.json()).toEqual(small);
      expect(readTotals.mock.calls).toEqual([[week], [null]]);
    } finally {
      await api.close();
    }
  });

  it("fails closed on data outside the aggregate shape and never echoes private fields or errors", async () => {
    const api = Fastify();
    const readTotals = vi.fn<(week: string | null) => Promise<unknown>>()
      .mockResolvedValueOnce({ ...totals, pairId: "private-pair-identifier" })
      .mockResolvedValueOnce({ ...small, enrolledPairs: 4 })
      .mockResolvedValueOnce({ ...totals, repeatMemories: { status: "insufficient_follow_up", pairsWithFullFollowUp: 2 } })
      .mockRejectedValueOnce(new Error("private database details"))
      .mockResolvedValueOnce(null);
    await api.register(registerTogetherReport, { verificationKey: publicKey, now: () => now, readTotals });
    try {
      for (let i = 0; i < 4; i++) {
        const failed = await api.inject({ url: target, headers: { authorization: proof(target) } });
        expect(failed.statusCode).toBe(503);
        expect(failed.json()).toEqual({ code: "REPORT_UNAVAILABLE" });
        expect(failed.headers["cache-control"]).toBe("private, no-store");
      }
      const invalidWeek = await api.inject({ url: target, headers: { authorization: proof(target) } });
      expect(invalidWeek.statusCode).toBe(400);
      expect(invalidWeek.json()).toEqual({ code: "REPORT_WEEK_OUT_OF_RANGE" });
    } finally {
      await api.close();
    }
  });

  it("enables the verifier only for the intended production service and honors the kill switch", () => {
    const environment = {
      RENDER: "true", RENDER_SERVICE_ID: "srv-dbsr5j6i0phs73dtrkq0", RENDER_GIT_BRANCH: "production",
      TOGETHER_REPORT_PUBLIC_KEY: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    };
    expect(productionTogetherReportKey(environment)?.asymmetricKeyType).toBe("ed25519");
    expect(productionTogetherReportKey({ ...environment, RENDER_SERVICE_ID: "srv-other" })).toBeNull();
    expect(productionTogetherReportKey({ ...environment, RENDER_GIT_BRANCH: "staging" })).toBeNull();
    expect(productionTogetherReportKey({ ...environment, IS_PULL_REQUEST: "true" })).toBeNull();
    expect(productionTogetherReportKey({ ...environment, TOGETHER_REPORT_HTTPS_DISABLED: "true" })).toBeNull();
    expect(productionTogetherReportKey({ ...environment, TOGETHER_REPORT_PUBLIC_KEY: "" })).toBeNull();
  });
});
