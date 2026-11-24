import type { DatePlanEvent } from "./date-plans.types";

export type ChatMessage = { id: string; sequence: string; author: "self" | "partner"; text: string; createdAt: string; dateSpot?: true; datePlanEvent?: DatePlanEvent };
export type ChatPage = { items: ChatMessage[]; nextCursor: string | null };
export type ChatPartner = { publicName: string; avatarPreset: string };
export type DirectLockInState = { state: "available" | "locked" } | { state: "requested" | "received"; requestId: string };
export type DirectInboxChat = { conversationId: string; discoveryConnectionId: string | null; partner: ChatPartner };
export type ConversationMetadata = { id: string; partner: ChatPartner; canChat: boolean; unavailableReason: null | "VERIFY_EMAIL" | "UNAVAILABLE"; inTogether?: boolean; lockIn?: DirectLockInState | null; profileConnectionId?: string; dateSpotsConversationId?: string; datePlansConversationId?: string; opening?: { questionText: string; hello: string; author: "self" | "partner"; publicName: string; avatarPreset: string; connectionId: string } };
