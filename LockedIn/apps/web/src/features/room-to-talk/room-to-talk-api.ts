import { journeyRequest } from "@/features/journey/journey.client";

export type RoomShelf = { id: string; name: string };
export type RoomPhase = "SAVED" | "SUGGESTED" | "TALK_NEXT" | "DISCUSSED";
export type RoomTopic = {
  id: string; shelf: string; question: string; phase: RoomPhase; yours: boolean; updatedAt: string;
  suggestedBy: "you" | "partner" | null; inPersonBy: "you" | "partner" | null; takeaway: string | null; messageCount: number;
};
export type RoomLibrary = { shelves: RoomShelf[]; topics: RoomTopic[] };
export type RoomQuote = { id: string; body: string; yours: boolean };
export type RoomMessage = RoomQuote & { kind: "REPLY" | "QUESTION"; createdAt: string; replyTo: RoomQuote | null };
export type RoomPage = { messages: RoomMessage[]; before: string | null };

export const roomPath = (space: string) => `/api/journey/relationships/${encodeURIComponent(space)}/room-to-talk`;
export const topicPath = (base: string, topicId: string) => `${base}/topics/${encodeURIComponent(topicId)}`;

export function writeRoom<T>(path: string, userId: string, method: "POST" | "PUT" | "DELETE", data?: object, keepalive = false) {
  return journeyRequest<T>(path, {
    method, headers: { "X-Together-Owner": userId }, body: data ? JSON.stringify(data) : undefined, keepalive,
  });
}

export const roomPhases: Record<RoomPhase, string> = { SAVED: "Saved", SUGGESTED: "Suggested", TALK_NEXT: "Talk next", DISCUSSED: "Discussed" };
export const unsortedShelf: RoomShelf = { id: "unsorted", name: "Unsorted" };
const starters: Record<string, string> = {
  marriage: "What do we want to feel sure about before getting married?",
  "date-ideas": "What would be a fun date for both of us under $30?",
};
export const starterQuestion = (shelf: string) =>
  Object.hasOwn(starters, shelf) ? starters[shelf]! : "What’s one thing we’d like to make more time for together?";
