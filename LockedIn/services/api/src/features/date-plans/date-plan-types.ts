import { z } from "zod";
import type { ChatMessageView } from "../messaging/messaging.types.js";

const uuid = z.string().uuid();
const revision = z.number().int().min(1).max(2_147_483_647);
const action = z.enum(["propose", "counter", "confirm", "decline", "withdraw", "cancel"]);
const time = z.strictObject({ localTime: z.string().length(16), timeZone: z.string().min(1).max(100), startsAt: z.string().min(20).max(30) });
const target = { planId: uuid, revision, requestId: uuid };
export const datePlanInput = z.union([
  z.strictObject({ action: z.literal("propose"), sourceMessageId: uuid, requestId: uuid, time }),
  z.strictObject({ action: z.literal("propose"), ticket: z.string().min(16).max(2400), requestId: uuid, time }),
  z.strictObject({ action: z.literal("counter"), ...target, time }),
  z.strictObject({ action: z.enum(["confirm", "decline", "withdraw", "cancel"]), ...target }),
]);
export type DatePlanAction = z.infer<typeof datePlanInput>;

const snapshot = z.strictObject({
  id: uuid, sourceMessageId: uuid, venueName: z.string().min(1).max(300), startsAt: z.iso.datetime(), timeZone: z.string().min(1).max(100), revision,
  state: z.enum(["pending", "confirmed", "declined", "withdrawn", "canceled"]),
});
const storedEventSchema = snapshot.extend({ action, fingerprint: z.string().regex(/^[a-f0-9]{64}$/) });
export type StoredDatePlanEvent = z.infer<typeof storedEventSchema>;
export type DatePlanEvent = Omit<StoredDatePlanEvent, "fingerprint">;
export type DatePlanView = z.infer<typeof snapshot> & { proposer: "self" | "partner" };
export type DatePlanReply = { activePlan: DatePlanView | null; message: ChatMessageView };

export function readStoredDatePlanEvent(value: unknown): StoredDatePlanEvent | null {
  const parsed = storedEventSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
