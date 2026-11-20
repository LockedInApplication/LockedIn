import type { ChatMessage } from "./messaging.types";

export type DatePlanTimeInput = { localTime: string; timeZone: string; startsAt: string };
export type DatePlanState = "pending" | "confirmed" | "declined" | "withdrawn" | "canceled";
export type DatePlanDecision = "confirm" | "decline" | "withdraw" | "cancel";
type Target = { planId: string; revision: number };
export type DatePlanAction =
  | ({ action: "propose"; time: DatePlanTimeInput } & ({ sourceMessageId: string } | { ticket: string }))
  | (Target & ({ action: "counter"; time: DatePlanTimeInput } | { action: DatePlanDecision }));
export type DatePlanSnapshot = { id: string; sourceMessageId: string; venueName: string; startsAt: string; timeZone: string; revision: number; state: DatePlanState };
export type DatePlanView = DatePlanSnapshot & { proposer: "self" | "partner" };
export type DatePlanEvent = DatePlanSnapshot & { action: DatePlanAction["action"] };
export type DatePlanReply = { activePlan: DatePlanView | null; message: ChatMessage };
export type DatePlanUpdate = { planId: string; action: DatePlanEvent["action"] };
export type DatePlanDetail = { plan: DatePlanView; activity: ChatMessage[]; canAct: boolean };
export type DatePlanVenue = { id: string; name: string };
export type DatePlanVenues = { items: DatePlanVenue[]; nextCursor: string | null };
export type DateSheetTarget = { kind: "loading-summary" } | { kind: "browse" } | { kind: "plan"; planId: string } | { kind: "shared"; venue: DatePlanVenue };
