import type { DatePlanEvent } from "../date-plans/date-plan-types.js";

export type ChatMessageView = { id: string; sequence: string; author: "self" | "partner"; text: string; createdAt: string; dateSpot?: true; datePlanEvent?: DatePlanEvent };
export type ChatPage = { items: ChatMessageView[]; nextCursor: string | null };
export type ChatResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string; retryAfter?: number };
