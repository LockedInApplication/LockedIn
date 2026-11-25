import { randomBytes, sign, verify, type KeyObject } from "node:crypto";
import { z } from "zod";

export const togetherReportOrigin = "https://lockedin-9yon.onrender.com";
export const togetherReportPath = "/internal/together-report";

const maxAge = 45;
const header = /^LockedInReportV1 ([1-9]\d{9})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{86})$/;
const dateLabel = z.iso.date();
const count = z.int().nonnegative();
const period = { weekStart: dateLabel, weekEndExclusive: dateLabel, timeZone: z.literal("UTC") };

// Fail closed if the database ever returns anything beyond the approved schema.
export const togetherReportResponse = z.discriminatedUnion("status", [
  z.strictObject({ ...period, status: z.literal("insufficient_cohort") }),
  z.strictObject({
    ...period, status: z.literal("ok"), enrolledPairs: count.min(5), pairsWithSharedAction: count,
    plansProposed: count, plansAccepted: count, plansMarkedDone: count,
    savedMemories: count, memoriesWithBothPeople: count,
    repeatMemories: z.discriminatedUnion("status", [
      z.strictObject({ status: z.literal("insufficient_follow_up") }),
      z.strictObject({ status: z.literal("ok"), pairsWithFullFollowUp: count.min(5), pairsWithAnotherSharedMemory: count }),
    ]),
  }),
]);

export function isReportMonday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return date.getUTCDay() === 1 && date.toISOString().slice(0, 10) === value;
}

export function reportWeekFromTarget(target: string): string | null | undefined {
  if (target === togetherReportPath) return null;
  const prefix = togetherReportPath + "?week=";
  if (!target.startsWith(prefix)) return undefined;
  const week = target.slice(prefix.length);
  return isReportMonday(week) ? week : undefined;
}

function signatureInput(target: string, time: string, nonce: string) {
  return Buffer.from(["lockedin.together-report.v1", togetherReportOrigin, "GET", target, time, nonce].join("\n"));
}

export function togetherReportAuthorization(target: string, signer: (payload: Buffer) => Buffer, time = Math.floor(Date.now() / 1000)) {
  const epoch = String(time);
  const nonce = randomBytes(16).toString("base64url");
  const signature = signer(signatureInput(target, epoch, nonce)).toString("base64url");
  return "LockedInReportV1 " + [epoch, nonce, signature].join(".");
}

export function signTogetherReport(key: KeyObject, target: string, time = Math.floor(Date.now() / 1000)) {
  return togetherReportAuthorization(target, payload => sign(null, payload, key), time);
}

export function verifyTogetherReport(key: KeyObject, target: string, auth: string | undefined, now: number) {
  const parts = auth?.match(header);
  if (!parts) return null;
  const [, epoch, nonce, encoded] = parts;
  const time = Number(epoch);
  if (time < now - maxAge || time > now + 10) return null;
  const nonceBytes = Buffer.from(nonce, "base64url"), signature = Buffer.from(encoded, "base64url");
  if (nonceBytes.toString("base64url") !== nonce || signature.length !== 64 || signature.toString("base64url") !== encoded) return null;
  return verify(null, signatureInput(target, epoch, nonce), key, signature) ? { nonce, expires: time + maxAge } : null;
}
