import type { KeyObject } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { productionTogetherReportKey } from "./together-report.production.js";
import { reportWeekFromTarget, togetherReportPath, togetherReportResponse, verifyTogetherReport } from "./together-report-protocol.js";

async function readTotals(week: string | null) {
  const { prisma } = await import("../../lib/prisma.js");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '8s'`;
    const [row] = await tx.$queryRaw<{ report: unknown }[]>`
      SELECT lockedin_reporting.weekly_together_report(${week}::date) AS report
    `;
    return row?.report ?? null;
  }, { timeout: 10000 });
}

export async function registerTogetherReport(server: FastifyInstance, options: {
  verificationKey?: KeyObject | null;
  now?: () => number;
  readTotals?: (week: string | null) => Promise<unknown>;
} = {}) {
  const key = options.verificationKey === undefined ? productionTogetherReportKey() : options.verificationKey;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  // This process only, bounded and expiring. Holds no report data.
  const used = new Map<string, number>();

  server.get(togetherReportPath, { exposeHeadRoute: false, logLevel: "warn" }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("Vary", "Authorization").header("X-Content-Type-Options", "nosniff");
    const week = reportWeekFromTarget(request.url);
    const time = now();
    const proof = key && week !== undefined && verifyTogetherReport(key, request.url, request.headers.authorization, time);
    if (!proof || week === undefined) return reply.code(404).send();
    for (const [nonce, expires] of used) if (expires < time) used.delete(nonce);
    if (used.has(proof.nonce)) return reply.code(404).send();
    if (used.size >= 128) return reply.code(429).send();
    used.set(proof.nonce, proof.expires);
    try {
      const totals = await (options.readTotals ?? readTotals)(week);
      if (totals === null) return reply.code(400).send({ code: "REPORT_WEEK_OUT_OF_RANGE" });
      return reply.send(togetherReportResponse.parse(totals));
    } catch {
      request.log.warn("Together report totals unavailable");
      return reply.code(503).send({ code: "REPORT_UNAVAILABLE" });
    }
  });
}
