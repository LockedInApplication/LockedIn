import { z } from "zod";
import { signedReportProtocol } from "./signed-weekly-report.js";

export const lockedInReportPath = "/internal/lockedin-report";
export const lockedInReportProtocol = signedReportProtocol(lockedInReportPath, "lockedin.weekly-app-report.v1");

const groupTotal = z.int().min(5).nullable();
const subtotal = z.union([z.literal(0), z.int().min(5)]).nullable();
const connectionTotals = z.strictObject({
  acceptedInvites: groupTotal,
  firstTwoWayChats: subtotal,
  repeatTwoWayChats: subtotal,
});
function validSubtotal(parent: number | null, child: number | null) {
  if (child === null) return true;
  if (parent === null || parent < 5 || child > parent) return false;
  return child === parent || parent - child >= 5;
}

// Only these totals and period/readiness labels can cross the API boundary.
export const lockedInReportResponse = z.strictObject({
  weekStart: z.iso.date(),
  weekEndExclusive: z.iso.date(),
  timeZone: z.literal("UTC"),
  firstChatsReady: z.boolean(),
  repeatChatsReady: z.boolean(),
  accounts: z.strictObject({ signups: groupTotal, verifiedAccounts: subtotal }),
  discover: connectionTotals,
  directInvites: connectionTotals,
}).refine(value => {
  if (!value.firstChatsReady && value.repeatChatsReady) return false;
  if (!validSubtotal(value.accounts.signups, value.accounts.verifiedAccounts)) return false;
  return [value.discover, value.directInvites].every(path =>
    (value.firstChatsReady || path.firstTwoWayChats === null) &&
    (value.repeatChatsReady || path.repeatTwoWayChats === null) &&
    validSubtotal(path.acceptedInvites, path.firstTwoWayChats) &&
    validSubtotal(path.firstTwoWayChats, path.repeatTwoWayChats));
}, "Invalid aggregate");
