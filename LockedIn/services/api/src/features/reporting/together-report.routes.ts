import type { FastifyInstance } from "fastify";
import { productionTogetherReportKey } from "./together-report.production.js";
import { togetherReportProtocol, togetherReportResponse } from "./together-report-protocol.js";
import { registerSignedWeeklyReport, type WeeklyReportOptions } from "./signed-weekly-report.js";

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

export async function registerTogetherReport(server: FastifyInstance, options: WeeklyReportOptions = {}) {
  registerSignedWeeklyReport(server, {
    protocol: togetherReportProtocol,
    key: options.verificationKey === undefined ? productionTogetherReportKey() : options.verificationKey,
    now: options.now,
    read: options.readTotals ?? readTotals,
    parse: value => togetherReportResponse.parse(value),
    logMessage: "Together report totals unavailable",
  });
}
