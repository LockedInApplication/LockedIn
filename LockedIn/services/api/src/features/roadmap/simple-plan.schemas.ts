import { z } from "zod";

const timeZone = z.string().max(100).regex(/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/).refine(zone => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
});
const planFields = z.object({
  title: z.string().trim().min(3).max(120),
  note: z.string().trim().max(600).nullable().default(null),
  day: z.iso.date().refine(day => day >= "1900-01-01").nullable().default(null),
  timeZone: timeZone.optional(),
});
const request = z.object({ requestId: z.uuid() });
const action = request.extend({ version: z.number().int().positive().max(2_000_000_000) });

export const simplePlanCreate = request.extend({ plan: planFields });
export const simplePlanAction = z.union([
  action.extend({ action: z.literal("counter"), plan: planFields }),
  action.extend({ action: z.enum(["accept", "pass", "withdraw", "done", "undo-done", "cancel"]) }),
]);

export type SimplePlanCreate = z.infer<typeof simplePlanCreate>;
export type SimplePlanAction = z.infer<typeof simplePlanAction>;
