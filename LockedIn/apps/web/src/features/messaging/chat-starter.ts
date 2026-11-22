export const togetherStarter = {
  key: "good-memory",
  text: "What’s something we’ve done together that you’d love to do again?",
} as const;

export function togetherChatHref(conversationId: string, withStarter = false) {
  const query = new URLSearchParams({ from: "together" });
  if (withStarter) query.set("starter", togetherStarter.key);
  return `/messages/${encodeURIComponent(conversationId)}?${query}`;
}

export function getTogetherStarter(from: string | string[] | undefined, starter: string | string[] | undefined) {
  return from === "together" && starter === togetherStarter.key ? togetherStarter.text : undefined;
}
