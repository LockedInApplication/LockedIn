"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/utils/authCLient";
import MemberChrome from "@/features/journey/components/MemberChrome";
import { notificationDestination } from "@/features/notifications";
import { ConnectedProfileView } from "@/features/discovery/ConnectedProfile";
import Chat, { ChatIdentity } from "./Chat";
import MessageSafetyActions from "./MessageSafetyActions";
import { messagingRequest } from "./messaging.client";
import type { ConversationMetadata } from "./messaging.types";
import { useChatRefresh } from "./use-chat-refresh";
import { JourneyApiError } from "@/lib/journey";
import styles from "./chat.module.scss";

export default function ChatPage({ conversationId, fromTogether = false }: { conversationId: string; fromTogether?: boolean }) {
  const session = authClient.useSession(), router = useRouter();
  const returnTo = `/messages/${encodeURIComponent(conversationId)}${fromTogether ? "?from=together" : ""}`;
  useEffect(() => { if (!session.isPending && !session.data?.user) router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`); },[session.isPending,session.data?.user,router,returnTo]);
  if (session.isPending || !session.data?.user) return <main><p role="status">Opening Messages…</p></main>;
  return <AccountChat key={`${session.data.user.id}:${conversationId}`} userId={session.data.user.id} name={session.data.user.name || "Your account"} conversationId={conversationId} fromTogether={fromTogether} returnTo={returnTo}/>;
}
function AccountChat({ userId,name,conversationId,fromTogether,returnTo }: { userId: string; name: string; conversationId: string; fromTogether: boolean; returnTo: string }) {
  const router = useRouter(), [metadata,setMetadata] = useState<ConversationMetadata | null>(null), [error,setError] = useState("");
  const expired = useCallback(() => router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`),[router,returnTo]);
  const [revision,setRevision] = useState(0);
  const retry = useCallback(() => setRevision(v => v+1),[]);
  useEffect(() => {
    const controller = new AbortController();
    void messagingRequest<ConversationMetadata>(userId,`/api/messaging/conversations/${conversationId}`,{ signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setMetadata(value); setError(""); } }).catch(e => { if (!controller.signal.aborted) {
      if (e instanceof JourneyApiError && [401,403,404,409].includes(e.status)) { setMetadata(null); setError("This chat is unavailable. Return to your Inbox or try again."); }
      else setError("Could not refresh chat availability. Your unfinished message has not changed.");
    } });
    return () => controller.abort();
  },[userId,conversationId,revision]);
  useChatRefresh({userId,onRefresh:retry});
  const ended = useCallback(() => { setMetadata(m => m ? { ...m,canChat:false,unavailableReason:"UNAVAILABLE" } : m); },[]);
  const signOut = async () => { const result = await authClient.signOut(); if (result.error) { setError("Could not sign out. Try again."); return; } router.replace("/login"); };
  const destination = fromTogether ? "Together" : "Inbox";
  const backAction = <Link className={styles.backLink} href={fromTogether ? "/journey" : "/connections"} aria-label={`Back to ${destination}`}>
    <span aria-hidden="true">←</span><strong className={styles.backLabel}>{destination}</strong>
  </Link>;
  return <MemberChrome className={styles.page} user={{name}} userId={userId} onNavigate={path => router.push(path)} onSignOut={signOut}
    onOpenNotification={async item => { router.push(notificationDestination(item)); return true; }} onActivity={retry} onExpired={expired}>
    <main className={styles.main}>
      <ChatPageBody userId={userId} metadata={metadata} error={error} retry={retry} onAccessEnded={ended} backAction={backAction}/>
    </main>
  </MemberChrome>;
}
export function ChatPageBody({userId,metadata,error,retry,onAccessEnded,backAction}:{userId:string;metadata:ConversationMetadata|null;error:string;retry:()=>void;onAccessEnded:()=>void;backAction?:ReactNode}) {
  return <>{!metadata ? backAction : null}{error ? <section role="alert"><p>{error}</p><button onClick={retry}>Try again</button></section> : null}{metadata ? <ConversationContent userId={userId} metadata={metadata} onAccessEnded={onAccessEnded} backAction={backAction}/> : !error ? <p role="status">Loading conversation…</p> : null}</>;
}
export function ConversationContent({ userId,metadata,onAccessEnded,backAction }: { userId: string; metadata: ConversationMetadata; onAccessEnded: () => void; backAction?: ReactNode }) {
  const [profileOpen,setProfileOpen] = useState(false);
  if (!metadata.canChat) return <>
    <div className={styles.chatHeader}>{backAction}<ChatIdentity partner={metadata.partner}/></div>
    <section role="status">{metadata.unavailableReason === "VERIFY_EMAIL" ? <><h2>Verify your email</h2><p>Verify your account email before using Messages.</p><Link href="/profile">Profile &amp; verification</Link></> : <p>This chat is unavailable.</p>}</section>
  </>;
  return <>
      <Chat conversationId={metadata.id} userId={userId} partner={metadata.partner} onAccessEnded={onAccessEnded} dateSpotsConversationId={metadata.dateSpotsConversationId} datePlansConversationId={metadata.datePlansConversationId}
        backAction={backAction} onViewProfile={metadata.profileConnectionId ? () => setProfileOpen(true) : undefined}
        openingContext={metadata.opening ? <details><summary>How you started talking</summary><p>{metadata.opening.questionText}</p><blockquote>{metadata.opening.hello}</blockquote></details> : undefined}/>
      <details><summary>Safety &amp; contact controls</summary><MessageSafetyActions userId={userId} conversationId={metadata.id} onBlocked={onAccessEnded}/></details>
      {profileOpen && metadata.profileConnectionId ? <ConnectedProfileView userId={userId} connectionId={metadata.profileConnectionId} onClose={() => setProfileOpen(false)}/> : null}
  </>;
}
