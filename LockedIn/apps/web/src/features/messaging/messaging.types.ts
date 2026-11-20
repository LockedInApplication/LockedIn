import type { DatePlanEvent } from "./date-plans.types";

export type ChatMessage = { id: string; sequence: string; author: "self" | "partner"; text: string; createdAt: string; dateSpot?: true; datePlanEvent?: DatePlanEvent };
export type ChatPage = { items: ChatMessage[]; nextCursor: string | null };
export type ChatPartner = { publicName: string; avatarPreset: string };
export type ConversationMetadata = { id: string; partner: ChatPartner; canChat: boolean; unavailableReason: null | "VERIFY_EMAIL" | "UNAVAILABLE"; profileConnectionId?: string; dateSpotsConversationId?: string; datePlansConversationId?: string; opening?: { questionText: string; hello: string; author: "self" | "partner"; publicName: string; avatarPreset: string; connectionId: string } };
