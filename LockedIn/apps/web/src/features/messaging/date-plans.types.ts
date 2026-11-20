import type { ChatMessage } from "./messaging.types";

export type DatePlanTimeInput = { localTime: string; timeZone: string; startsAt: string };
export type DatePlanState = "pending" | "confirmed" | "declined" | "withdrawn" | "canceled";
export type DatePlanDecision = "confirm" | "decline" | "withdraw" | "cancel";
type Target = { planId: string; revision: number };
export type DatePlanAction =
  | { action: "propose"; sourceMessageId: string; time: DatePlanTimeInput }
  | (Target & ({ action: "counter"; time: DatePlanTimeInput } | { action: DatePlanDecision }));
export type DatePlanSnapshot = { id: string; sourceMessageId: string; venueName: string; startsAt: string; timeZone: string; revision: number; state: DatePlanState };
export type DatePlanView = DatePlanSnapshot & { proposer: "self" | "partner" };
export type DatePlanEvent = DatePlanSnapshot & { action: DatePlanAction["action"] };
export type DatePlanReply = { activePlan: DatePlanView | null; message: ChatMessage };
