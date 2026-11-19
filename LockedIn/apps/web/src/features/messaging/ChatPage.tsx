"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/utils/authCLient";
import WorkspaceHeader from "@/features/journey/components/WorkspaceHeader";
import { NotificationBell, notificationDestination } from "@/features/notifications";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import { ConnectedProfileView } from "@/features/discovery/ConnectedProfile";
import Chat from "./Chat";
import MessageSafetyActions from "./MessageSafetyActions";
import { messagingRequest } from "./messaging.client";
import type { ConversationMetadata } from "./messaging.types";
import { useChatRefresh } from "./use-chat-refresh";
import { JourneyApiError } from "@/lib/journey";
import styles from "./chat.module.scss";

export default function ChatPage({ conversationId }: { conversationId: string }) {
  const session = authClient.useSession(), router = useRouter();
  useEffect(() => { if (!session.isPending && !session.data?.user) router.replace(`/login?returnTo=${encodeURIComponent(`/messages/${conversationId}`)}`); },[session.isPending,session.data?.user,router,conversationId]);
  if (session.isPending || !session.data?.user) return <main><p role="status">Opening Messages…</p></main>;
  return <AccountChat key={`${session.data.user.id}:${conversationId}`} userId={session.data.user.id} name={session.data.user.name || "Your account"} conversationId={conversationId}/>;
}
function AccountChat({ userId,name,conversationId }: { userId: string; name: string; conversationId: string }) {
  const router = useRouter(), [metadata,setMetadata] = useState<ConversationMetadata | null>(null), [error,setError] = useState("");
  const expired = useCallback(() => router.replace(`/login?returnTo=${encodeURIComponent(`/messages/${conversationId}`)}`),[router,conversationId]);
  const [revision,setRevision] = useState(0);
  const retry = useCallback(() => setRevision(v => v+1),[]);
  useEffect(() => {
    const controller = new AbortController();
    void messagingRequest<ConversationMetadata>(userId,`/api/messaging/conversations/${conversationId}`,{ signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setMetadata(value); setError(""); } }).catch(e => { if (!controller.signal.aborted) {
      if (e instanceof JourneyApiError && [401,403,404,409].includes(e.status)) { setMetadata(null); setError("This chat is unavailable. Return to your shared space or try again."); }
      else setError("Could not refresh chat availability. Your unfinished message has not changed.");
    } });
    return () => controller.abort();
  },[userId,conversationId,revision]);
  useChatRefresh({userId,onRefresh:retry});
  const ended = useCallback(() => { setMetadata(m => m ? { ...m,canChat:false,unavailableReason:"UNAVAILABLE" } : m); },[]);
  const signOut = async () => { const result = await authClient.signOut(); if (result.error) { setError("Could not sign out. Try again."); return; } router.replace("/login"); };
  return <div className={styles.page}>
    <WorkspaceHeader user={{name}} onHome={() => router.push("/journey")} onProfile={() => router.push("/profile")} onInvitations={() => router.push("/journey?invitations=manage")} onSignOut={signOut}
      notifications={<NotificationBell userId={userId} onOpen={async item => { router.push(notificationDestination(item)); return true; }} onActivity={retry} onExpired={expired}/>}/>
    <main className={styles.main}><Link href="/journey">← Shared space</Link>
      <ChatPageBody userId={userId} metadata={metadata} error={error} retry={retry} onAccessEnded={ended}/>
    </main>
  </div>;
}
export function ChatPageBody({userId,metadata,error,retry,onAccessEnded}:{userId:string;metadata:ConversationMetadata|null;error:string;retry:()=>void;onAccessEnded:()=>void}) {
  return <>{error ? <section role="alert"><p>{error}</p><button onClick={retry}>Try again</button></section> : null}{metadata ? <ConversationContent userId={userId} metadata={metadata} onAccessEnded={onAccessEnded}/> : !error ? <p role="status">Loading conversation…</p> : null}</>;
}
export function ConversationContent({ userId,metadata,onAccessEnded }: { userId: string; metadata: ConversationMetadata; onAccessEnded: () => void }) {
  const [profileOpen,setProfileOpen] = useState(false);
  return <><h1><ProfileAvatar name={metadata.partner.publicName} preset={metadata.partner.avatarPreset}/> Conversation with {metadata.partner.publicName}</h1>
    {!metadata.canChat ? <section role="status">{metadata.unavailableReason === "VERIFY_EMAIL" ? <><h2>Verify your email</h2><p>Verify your account email before using Messages.</p><Link href="/profile">Profile &amp; verification</Link></> : <p>This chat is unavailable.</p>}</section> : <>
      {metadata.profileConnectionId ? <button type="button" aria-label={`View ${metadata.partner.publicName}’s profile`} onClick={() => setProfileOpen(true)}>View {metadata.partner.publicName}’s profile</button> : null}
      <Chat conversationId={metadata.id} userId={userId} partner={metadata.partner} onAccessEnded={onAccessEnded} dateSpotsConversationId={metadata.dateSpotsConversationId}
        openingContext={metadata.opening ? <details><summary>How this conversation started</summary><p>{metadata.opening.questionText}</p><blockquote>{metadata.opening.hello}</blockquote></details> : undefined}/>
      <details><summary>Safety &amp; contact controls</summary><MessageSafetyActions userId={userId} conversationId={metadata.id} onBlocked={onAccessEnded}/></details>
      {profileOpen && metadata.profileConnectionId ? <ConnectedProfileView userId={userId} connectionId={metadata.profileConnectionId} onClose={() => setProfileOpen(false)}/> : null}
    </>}
  </>;
}
