import { messagingRequest, type ChatRequest } from "./messaging.client";
import type { ChatMessage, ChatPage } from "./messaging.types";
export type { ChatMessage, ChatPage } from "./messaging.types";
const unique = (items: ChatMessage[]) => [...new Map(items.map(m => [m.id,m])).values()];
export function mergeLatestMessages(previous: ChatPage | null, latest: ChatPage): ChatPage {
  if (!previous?.items.length || !latest.items.length) return { ...latest, items: unique(latest.items) };
  const overlap = previous.items.findIndex(m => m.id === latest.items[0]!.id);
  return overlap > 0 ? { items: unique([...previous.items.slice(0,overlap),...latest.items]), nextCursor: previous.nextCursor } : { ...latest, items: unique(latest.items) };
}
export function prependMessages(current: ChatPage, older: ChatPage): ChatPage {
  return { items: unique([...older.items,...current.items]), nextCursor: older.nextCursor };
}
// One mounted identity owns its requests and retry receipt. Never persisted.
export class ChatSession {
  readonly controller = new AbortController();
  private attempt: { text: string; id: string } | null = null;
  private readonly path: string;
  constructor(private readonly ownerId: string, conversationId: string, private readonly request: ChatRequest = messagingRequest, path?: string) { this.path = path ?? `/api/messaging/conversations/${conversationId}/messages`; }
  private assertActive() { if (this.controller.signal.aborted) throw new DOMException("Chat identity ended","AbortError"); }
  async load(before?: string) {
    this.assertActive();
    const page = await this.request<ChatPage>(this.ownerId,`${this.path}${before ? `?before=${before}` : ""}`,{ signal: this.controller.signal });
    this.assertActive(); return page;
  }
  async send(text: string) {
    this.assertActive();
    if (this.attempt?.text !== text) this.attempt = { text, id: crypto.randomUUID() };
    const saved = await this.request<ChatMessage>(this.ownerId,this.path,{ method: "POST", signal: this.controller.signal, body: JSON.stringify({ text, requestId: this.attempt.id }) });
    this.assertActive(); this.attempt = null; return saved;
  }
  close() { this.controller.abort(); this.attempt = null; }
}
