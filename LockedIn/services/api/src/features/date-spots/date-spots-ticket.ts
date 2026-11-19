import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { placeIdSchema } from "./date-spots-provider.js";

const payload = z.strictObject({ conversation: z.string().uuid(), owner: z.string(), place: placeIdSchema, name: z.string().min(1).max(300), expires: z.number().int() });
const sign = (value: string, secret: string) => createHmac("sha256",secret).update("date-spot-ticket-v1:" + value).digest();
export function dateSpotTicket(conversation: string, owner: string, place: string, name: string, secret: string, now = Date.now()) {
  const value = Buffer.from(JSON.stringify({ conversation, owner, place, name, expires: now + 30 * 60_000 })).toString("base64url");
  return value + "." + sign(value, secret).toString("base64url");
}
export function readDateSpotTicket(ticket: string, conversation: string, owner: string, secret: string, now = Date.now()) {
  const parts = ticket.split(".");
  if (parts.length !== 2 || !parts.every(part => /^[a-zA-Z0-9_-]+$/.test(part))) return null;
  try {
    const [data, mac] = parts as [string,string];
    const signature = Buffer.from(mac, "base64url"), expected = sign(data, secret);
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected) || signature.toString("base64url") !== mac) return null;
    const parsed = payload.safeParse(JSON.parse(Buffer.from(data, "base64url").toString("utf8")));
    return parsed.success && parsed.data.conversation === conversation && parsed.data.owner === owner && parsed.data.expires > now ? parsed.data : null;
  } catch { return null; }
}
