import type { FastifyInstance } from "fastify";
import { lockedInReportProtocol, lockedInReportResponse } from "./lockedin-report-protocol.js";
import { registerSignedWeeklyReport, type WeeklyReportOptions } from "./signed-weekly-report.js";
import { productionLockedInReportKey } from "./together-report.production.js";

async function readTotals(week: string | null) {
  const { prisma } = await import("../../lib/prisma.js");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '8s'`;
    const [row] = await tx.$queryRaw<{ report: unknown }[]>`
      SELECT lockedin_reporting.weekly_lockedin_report(${week}::date) AS report
    `;
    return row?.report ?? null;
  }, { timeout: 10000 });
}

export async function registerLockedInReport(server: FastifyInstance, options: WeeklyReportOptions = {}) {
  const key = options.verificationKey === undefined ? productionLockedInReportKey() : options.verificationKey;
  if (!key) return;
  registerSignedWeeklyReport(server, {
    protocol: lockedInReportProtocol,
    key,
    now: options.now,
    read: options.readTotals ?? readTotals,
    parse: value => lockedInReportResponse.parse(value),
    logMessage: "LockedIn report totals unavailable",
  });
}
