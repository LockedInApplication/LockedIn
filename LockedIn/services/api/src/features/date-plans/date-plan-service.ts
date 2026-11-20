import { createHash, randomUUID } from "node:crypto";
import type { ChatConversation, ChatDatePlan, Prisma } from "../../../generated/prisma/client.js";
import { chatMissing } from "../messaging/messaging-access.service.js";
import { messageScope, messageView, sendMessage } from "../messaging/messaging-message.service.js";
import type { ChatResult } from "../messaging/messaging.types.js";
import { readDateSpotTicket } from "../date-spots/date-spots-ticket.js";
import { createDatePlanCalendar } from "./date-plan-calendar.js";
import { validateDatePlanTime } from "./date-plan-time.js";
import { readStoredDatePlanEvent, type DatePlanAction, type DatePlanReply, type DatePlanView, type StoredDatePlanEvent } from "./date-plan-types.js";

const conflict = { ok: false, status: 409, error: "This date plan changed. Check the latest plan and try again." } as const;
const invalidTime = { ok: false, status: 400, error: "Choose an unambiguous time in the next 90 days." } as const;
const sharedPlaceName = (text: string) => /^Suggested date spot: (.+)$/s.exec(text)?.[1]?.trim() || "";
const scopedPlan = (conversation: ChatConversation, planId: string) => ({ id: planId, conversationId: conversation.id });
const fallback: Record<DatePlanAction["action"], string> = {
  propose: "Suggested a date time.", counter: "Suggested another time.", confirm: "Confirmed the date.",
  decline: "Declined the date suggestion.", withdraw: "Withdrew the date suggestion.", cancel: "Canceled the date.",
};

const toSnapshot = (plan: Pick<ChatDatePlan, "id" | "sourceMessageId" | "venueName" | "startsAt" | "timeZone" | "revision" | "state">) => ({
  id: plan.id, sourceMessageId: plan.sourceMessageId, venueName: plan.venueName, startsAt: plan.startsAt.toISOString(),
  timeZone: plan.timeZone, revision: plan.revision, state: plan.state,
});
const toView = (plan: Pick<ChatDatePlan, keyof ReturnType<typeof toSnapshot> | "proposerId">, actorId: string): DatePlanView => ({
  ...toSnapshot(plan), proposer: plan.proposerId === actorId ? "self" : "partner",
});

function findActivePlan(tx: Prisma.TransactionClient, conversationId: string, now: Date) {
  return tx.chatDatePlan.findFirst({ where: { conversationId, startsAt: { gt: now }, state: { in: ["pending", "confirmed"] } }, orderBy: { id: "asc" } });
}

export async function getActiveDatePlan(tx: Prisma.TransactionClient, conversation: ChatConversation, actorId: string, now: Date) {
  const plan = await findActivePlan(tx, conversation.id, now);
  return plan ? toView(plan, actorId) : null;
}

export async function getDatePlan(tx: Prisma.TransactionClient, conversation: ChatConversation, actorId: string, planId: string, now: Date) {
  const plan = await tx.chatDatePlan.findFirst({ where: scopedPlan(conversation, planId) });
  if (!plan) return chatMissing;
  const rows = await tx.discoveryMessage.findMany({ where: {
    ...messageScope(conversation), datePlanEvent: { path: ["id"], equals: planId },
  }, orderBy: { sequence: "asc" } });
  return { ok: true as const, value: {
    plan: toView(plan, actorId), activity: rows.map(row => messageView(row, actorId)),
    canAct: plan.startsAt > now && (plan.state === "pending" || plan.state === "confirmed"),
  } };
}

export async function listPlanVenues(tx: Prisma.TransactionClient, conversation: ChatConversation, before?: string) {
  const rows = await tx.discoveryMessage.findMany({ where: {
    ...messageScope(conversation), dateSpotPlaceId: { not: null }, ...(before ? { sequence: { lt: BigInt(before) } } : {}),
  }, orderBy: { sequence: "desc" }, take: 31, select: { id: true, text: true, sequence: true } });
  const page = rows.slice(0, 30);
  return { items: page.flatMap(({ id, text }) => {
    const name = sharedPlaceName(text);
    return name ? [{ id, name }] : [];
  }), nextCursor: rows.length > 30 ? String(page.at(-1)!.sequence) : null };
}

export async function readPlanVenueId(tx: Prisma.TransactionClient, conversation: ChatConversation, planId: string) {
  const plan = await tx.chatDatePlan.findFirst({ where: scopedPlan(conversation, planId),
    select: { venuePlaceId: true, sourceMessage: { select: { dateSpotPlaceId: true } } },
  });
  return plan?.venuePlaceId ?? plan?.sourceMessage.dateSpotPlaceId ?? null;
}

export async function getDatePlanCalendar(tx: Prisma.TransactionClient, conversation: ChatConversation, planId: string, now: Date) {
  const plan = await tx.chatDatePlan.findFirst({ where: { id: planId, conversationId: conversation.id, startsAt: { gt: now }, state: "confirmed" } });
  if (!plan?.confirmedAt) return chatMissing;
  return { ok: true as const, value: createDatePlanCalendar({ ...plan, confirmedAt: plan.confirmedAt }) };
}

function requestFingerprint(input: DatePlanAction) {
  const target = input.action === "propose" ? ("ticket" in input ? ["ticket", input.ticket] : [input.sourceMessageId]) : [input.planId, input.revision];
  const time = "time" in input ? [input.time.localTime, input.time.timeZone, input.time.startsAt] : [];
  return createHash("sha256").update(JSON.stringify([input.action, ...target, ...time])).digest("hex");
}

// The caller must hold the same conversation and pair locks as sendMessage.
export async function applyDatePlanAction(tx: Prisma.TransactionClient, conversation: ChatConversation, actorId: string, input: DatePlanAction, now: Date): Promise<ChatResult<DatePlanReply> & { notify?: string[] }> {
  const fingerprint = requestFingerprint(input);
  const prior = await tx.discoveryMessage.findFirst({ where: { ...messageScope(conversation), senderId: actorId, requestId: input.requestId } });
  if (prior) {
    if (readStoredDatePlanEvent(prior.datePlanEvent)?.fingerprint !== fingerprint) return conflict;
    return { ok: true, value: { activePlan: await getActiveDatePlan(tx, conversation, actorId, now), message: messageView(prior, actorId) } };
  }
  const existing = await findActivePlan(tx, conversation.id, now);
  const time = "time" in input ? validateDatePlanTime(input.time, now) : undefined;
  type DateState = Pick<ChatDatePlan, "id" | "sourceMessageId" | "venueName" | "startsAt" | "timeZone" | "revision" | "proposerId" | "state" | "confirmedAt">;
  let next: DateState;
  let venuePlaceId: string | undefined;
  let inviteId: string | undefined;
  if (input.action === "propose") {
    if (existing) return conflict;
    if (!time) return invalidTime;
    let sourceMessageId: string, venueName: string;
    if ("ticket" in input) {
      const secret = process.env.BETTER_AUTH_SECRET;
      const venue = secret && readDateSpotTicket(input.ticket, conversation.id, actorId, secret, now.getTime());
      if (!venue) return chatMissing;
      inviteId = sourceMessageId = randomUUID();
      venueName = venue.name;
      venuePlaceId = venue.place;
    } else {
      const source = await tx.discoveryMessage.findFirst({
        where: { ...messageScope(conversation), id: input.sourceMessageId, dateSpotPlaceId: { not: null } },
        select: { id: true, text: true },
      });
      venueName = source ? sharedPlaceName(source.text) : "";
      if (!source || !venueName || venueName.length > 300) return chatMissing;
      sourceMessageId = source.id;
    }
    next = { id: randomUUID(), sourceMessageId, venueName, ...time, revision: 1, proposerId: actorId, state: "pending", confirmedAt: null };
  } else {
    if (!existing || existing.id !== input.planId || existing.revision !== input.revision) return conflict;
    const { id, sourceMessageId, venueName, startsAt, timeZone, revision, proposerId, state, confirmedAt } = existing;
    next = { id, sourceMessageId, venueName, startsAt, timeZone, revision, proposerId, state, confirmedAt };
    const mine = proposerId === actorId;
    if (input.action === "cancel") {
      if (state !== "confirmed") return conflict;
      next.state = "canceled";
    } else {
      if (state !== "pending" || (input.action === "withdraw" ? !mine : mine)) return conflict;
      switch (input.action) {
        case "counter":
          if (!time) return invalidTime;
          next = { ...next, ...time, proposerId: actorId, revision: revision + 1 };
          break;
        case "confirm": next.state = "confirmed"; next.confirmedAt = now; break;
        case "decline": next.state = "declined"; break;
        case "withdraw": next.state = "withdrawn"; break;
      }
    }
  }
  const event: StoredDatePlanEvent = { ...toSnapshot(next), action: input.action, fingerprint };
  const sent = await sendMessage(tx, conversation, actorId, { ...(inviteId ? { id: inviteId } : {}), requestId: input.requestId, text: fallback[input.action], datePlanEvent: event });
  if (!sent.ok) return sent;
  if (existing) {
    const { id, ...data } = next;
    await tx.chatDatePlan.update({ where: { id }, data });
  } else {
    await tx.chatDatePlan.create({ data: { ...next, ...(venuePlaceId ? { venuePlaceId } : {}), conversationId: conversation.id } });
  }
  const activePlan = next.state === "pending" || next.state === "confirmed" ? toView(next, actorId) : null;
  return { ok: true, value: { activePlan, message: sent.value }, notify: sent.notify };
}
