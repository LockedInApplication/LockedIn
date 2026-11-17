export type ChatMessage = { id: string; sequence: string; author: "self" | "partner"; text: string; createdAt: string };
export type ChatPage = { items: ChatMessage[]; nextCursor: string | null };

// Keep loaded history only when it overlaps the current window.
// Otherwise start a fresh page so an offline gap is never silently skipped.
export function mergeLatestMessages(previous: ChatPage | null, latest: ChatPage): ChatPage {
  if (!previous || !previous.items.length || !latest.items.length) return latest;
  const overlap = previous.items.findIndex(message => message.id === latest.items[0]!.id);
  return overlap > 0
    ? { items: [...previous.items.slice(0, overlap), ...latest.items], nextCursor: previous.nextCursor }
    : latest;
}
