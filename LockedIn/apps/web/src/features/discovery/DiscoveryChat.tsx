"use client";
import { useState } from "react";
import Chat from "@/features/messaging/Chat";
import { useDiscovery } from "./DiscoveryShell";
import { discoveryRequest } from "./discovery.client";
import ConversationOpening, { type ConversationOpener } from "./ConversationOpening";
import DiscoverySafetyActions from "./DiscoverySafetyActions";

export default function DiscoveryChat({connectionId,opening,onBlocked,dateSpotsConversationId}: {connectionId: string; opening: ConversationOpener; onBlocked: () => void; dateSpotsConversationId?: string}) {
  const {userId,busy} = useDiscovery();
  const [openingReport,setOpeningReport] = useState(false);
  return <><Chat conversationId={connectionId} userId={userId} partner={opening.partner} busy={busy} onAccessEnded={onBlocked} ariaLabel="Discovery chat" dateSpotsConversationId={dateSpotsConversationId}
    request={discoveryRequest} messagesPath={`/api/discovery/connections/${connectionId}/messages`}
    openingContext={<ConversationOpening opening={opening} busy={busy} onReport={() => setOpeningReport(true)}/>}
    renderReport={(message,blocked) => <DiscoverySafetyActions key={message.id} expanded connectionId={connectionId} reportSource={{sourceType:"MESSAGE",sourceId:message.id,label:"Received message",preview:message.text}} onBlocked={blocked}/>}/>
    {openingReport ? <section aria-label="Report opening message"><button type="button" onClick={() => setOpeningReport(false)}>Close opening report</button><DiscoverySafetyActions expanded connectionId={connectionId} reportSource={{sourceType:"INVITATION",sourceId:connectionId,label:"Opening message",preview:opening.hello}} onBlocked={onBlocked}/></section> : null}
  </>;
}
