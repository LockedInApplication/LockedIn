import ChatPage from "@/features/messaging/ChatPage";
export default async function Page({ params, searchParams }: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const [{ conversationId }, { from }] = await Promise.all([params, searchParams]);
  return <ChatPage conversationId={conversationId} fromTogether={from === "together"}/>;
}
