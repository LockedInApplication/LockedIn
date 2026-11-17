import type { DiscoveryConnectionView } from "./discovery.types";
import styles from "./discovery.module.scss";
import chatStyles from "./discovery-chat.module.scss";
import MessageActions from "./MessageActions";

export type ConversationOpener = Pick<DiscoveryConnectionView, "topic" | "hello" | "inviter" | "partner">;
export default function ConversationOpening({ opening, onReport, busy }: {
  opening: ConversationOpener; onReport: () => void; busy: boolean;
}) {
  const mine = opening.inviter === "self";
  return <div aria-label="Conversation opening">
    <details><summary>Prompt that started this conversation</summary><p className={styles.quote}>{opening.topic.text}</p></details>
    {opening.hello.trim() ? <ol className={chatStyles.messages} aria-label="Opening message">
      <li className={mine ? chatStyles.mine : undefined}>
        <div className={chatStyles.messageMeta}><strong>{mine ? "You" : opening.partner.publicName}</strong>
        {!mine ? <MessageActions opening busy={busy} onReport={onReport}/> : null}</div>
        <p>{opening.hello}</p>
      </li>
    </ol> : <p className={styles.muted}>This earlier invitation included a question without a message.</p>}
  </div>;
}
