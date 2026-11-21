import type { DiscoveryConnectionView } from "./discovery.types";
import chatStyles from "@/features/messaging/chat.module.scss";
import MessageActions from "./MessageActions";

export type ConversationOpener = Pick<DiscoveryConnectionView, "topic" | "hello" | "inviter" | "partner">;
export default function ConversationOpening({ opening, onReport, busy }: {
  opening: ConversationOpener; onReport: () => void; busy: boolean;
}) {
  const mine = opening.inviter === "self";
  return <details aria-label="Conversation opening">
    <summary>How you started talking</summary>
    <p>{opening.topic.text}</p>
    {opening.hello.trim() ? <div className={chatStyles.openerReply} aria-label="Opening message">
      <div><strong>{mine ? "You" : opening.partner.publicName}</strong><p>{opening.hello}</p></div>
      {!mine ? <MessageActions opening busy={busy} onReport={onReport}/> : null}
    </div> : <p>This earlier invitation included a question without a message.</p>}
  </details>;
}
