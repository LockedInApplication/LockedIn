import ChatPage from "@/features/messaging/ChatPage";
export default async function Page({ params }: { params: Promise<{conversationId: string}> }) {
  const { conversationId } = await params;
  return <ChatPage conversationId={conversationId}/>;
}
