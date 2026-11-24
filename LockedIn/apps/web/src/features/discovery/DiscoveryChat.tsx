"use client";
import { useState, type ReactNode } from "react";
import Chat from "@/features/messaging/Chat";
import { messageReportPreview } from "@/features/messaging/date-plan-time";
import { useDiscovery } from "./DiscoveryShell";
import { discoveryRequest } from "./discovery.client";
import ConversationOpening, { type ConversationOpener } from "./ConversationOpening";
import DiscoverySafetyActions from "./DiscoverySafetyActions";

export default function DiscoveryChat({connectionId,opening,onBlocked,backAction,onViewProfile,dateSpotsConversationId,datePlansConversationId,showTogetherPrompt}: {connectionId: string; opening: ConversationOpener; onBlocked: () => void; backAction: ReactNode; onViewProfile?: () => void; dateSpotsConversationId?: string; datePlansConversationId?: string; showTogetherPrompt?:boolean}) {
  const {userId,busy} = useDiscovery();
  const [openingReport,setOpeningReport] = useState(false);
  return <><Chat conversationId={connectionId} userId={userId} partner={opening.partner} busy={busy} onAccessEnded={onBlocked} ariaLabel="Discovery chat" dateSpotsConversationId={dateSpotsConversationId} datePlansConversationId={datePlansConversationId}
    backAction={backAction} onViewProfile={onViewProfile} showTogetherPrompt={showTogetherPrompt}
    request={discoveryRequest} messagesPath={`/api/discovery/connections/${connectionId}/messages`}
    openingContext={<ConversationOpening opening={opening} busy={busy} onReport={() => setOpeningReport(true)}/>}
    renderReport={(message,blocked) => <DiscoverySafetyActions key={message.id} expanded connectionId={connectionId} reportSource={{sourceType:"MESSAGE",sourceId:message.id,label:"Received message",preview:messageReportPreview(message)}} onBlocked={blocked}/>}/>
    {openingReport ? <section aria-label="Report opening message"><button type="button" onClick={() => setOpeningReport(false)}>Close opening report</button><DiscoverySafetyActions expanded connectionId={connectionId} reportSource={{sourceType:"INVITATION",sourceId:connectionId,label:"Opening message",preview:opening.hello}} onBlocked={onBlocked}/></section> : null}
  </>;
}
