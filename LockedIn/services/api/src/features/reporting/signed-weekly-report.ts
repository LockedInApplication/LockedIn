import { randomBytes, sign, verify, type KeyObject } from "node:crypto";
import type { FastifyInstance } from "fastify";

export const reportOrigin = "https://lockedin-9yon.onrender.com";
const maxAge = 45;
const header = /^LockedInReportV1 ([1-9]\d{9})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{86})$/;
export const reportEpoch = () => Math.floor(Date.now() / 1000);

export function isReportMonday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return date.getUTCDay() === 1 && date.toISOString().slice(0, 10) === value;
}

export function signedReportProtocol(path: string, audience: string) {
  function input(target: string, time: string, nonce: string) {
    return Buffer.from([audience, reportOrigin, "GET", target, time, nonce].join("\n"));
  }
  function authorization(target: string, signer: (payload: Buffer) => Buffer, time = reportEpoch()) {
    const epoch = String(time);
    const nonce = randomBytes(16).toString("base64url");
    const signature = signer(input(target, epoch, nonce)).toString("base64url");
    return "LockedInReportV1 " + [epoch, nonce, signature].join(".");
  }
  return {
    path,
    weekFromTarget(target: string): string | null | undefined {
      if (target === path) return null;
      const prefix = path + "?week=";
      if (!target.startsWith(prefix)) return undefined;
      const week = target.slice(prefix.length);
      return isReportMonday(week) ? week : undefined;
    },
    authorization,
    sign(key: KeyObject, target: string, time = reportEpoch()) {
      return authorization(target, payload => sign(null, payload, key), time);
    },
    verify(key: KeyObject, target: string, auth: string | undefined, now: number) {
      const parts = auth?.match(header);
      if (!parts) return null;
      const [, epoch, nonce, encoded] = parts;
      const time = Number(epoch);
      if (time < now - maxAge || time > now + 10) return null;
      const nonceBytes = Buffer.from(nonce, "base64url"), signature = Buffer.from(encoded, "base64url");
      if (nonceBytes.toString("base64url") !== nonce || signature.length !== 64 || signature.toString("base64url") !== encoded) return null;
      return verify(null, input(target, epoch, nonce), key, signature) ? { nonce, expires: time + maxAge } : null;
    },
  };
}

export type WeeklyReportOptions = {
  verificationKey?: KeyObject | null;
  now?: () => number;
  readTotals?: (week: string | null) => Promise<unknown>;
};

export function registerSignedWeeklyReport(server: FastifyInstance, options: {
  protocol: ReturnType<typeof signedReportProtocol>;
  key: KeyObject | null;
  now?: () => number;
  read: (week: string | null) => Promise<unknown>;
  parse: (value: unknown) => object;
  logMessage: string;
}) {
  const { protocol, key, read, parse, logMessage, now = reportEpoch } = options;
  // Separate per report; bounded, expires, and stores no report data.
  const used = new Map<string, number>();
  server.get(protocol.path, { exposeHeadRoute: false, logLevel: "warn" }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store").header("Vary", "Authorization").header("X-Content-Type-Options", "nosniff");
    const week = protocol.weekFromTarget(request.url);
    const time = now();
    const proof = key && week !== undefined && protocol.verify(key, request.url, request.headers.authorization, time);
    if (!proof || week === undefined) return reply.code(404).send();
    for (const [nonce, expires] of used) if (expires < time) used.delete(nonce);
    if (used.has(proof.nonce)) return reply.code(404).send();
    if (used.size >= 128) return reply.code(429).send();
    used.set(proof.nonce, proof.expires);
    try {
      const totals = await read(week);
      if (totals === null) return reply.code(400).send({ code: "REPORT_WEEK_OUT_OF_RANGE" });
      return reply.send(parse(totals));
    } catch {
      request.log.warn(logMessage);
      return reply.code(503).send({ code: "REPORT_UNAVAILABLE" });
    }
  });
}
