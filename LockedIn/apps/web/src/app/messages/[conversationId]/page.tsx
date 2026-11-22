import ChatPage from "@/features/messaging/ChatPage";
import { getTogetherStarter } from "@/features/messaging/chat-starter";
export default async function Page({ params, searchParams }: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ from?: string | string[]; starter?: string | string[] }>;
}) {
  const [{ conversationId }, { from, starter }] = await Promise.all([params, searchParams]);
  return <ChatPage conversationId={conversationId} fromTogether={from === "together"} initialDraft={getTogetherStarter(from, starter)}/>;
}
