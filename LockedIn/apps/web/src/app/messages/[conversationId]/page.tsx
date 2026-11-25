import ChatPage from "@/features/messaging/ChatPage";
import { manageTogetherSource } from "@/features/journey/journey.navigation";
import { getTogetherStarter } from "@/features/messaging/chat-starter";
export default async function Page({ params, searchParams }: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ from?: string | string[]; starter?: string | string[] }>;
}) {
  const [{ conversationId }, { from, starter }] = await Promise.all([params, searchParams]);
  return <ChatPage conversationId={conversationId} fromTogether={from === "together"} fromManageTogether={from === manageTogetherSource}
    initialDraft={getTogetherStarter(from, starter)}/>;
}
