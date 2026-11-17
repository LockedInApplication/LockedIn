import type {DiscoveryConnectionView} from "./discovery.types";
import styles from "./discovery.module.scss";
export default function StarterConversation({connection}:{connection:DiscoveryConnectionView}){
  if(!connection.sharedResponses.length&&!connection.ownDraft?.text)return null;
  return <details className={styles.card}><summary>Earlier starter answers · read-only history</summary>
    <p className={styles.muted}>These answers were saved before the chat-first flow. Continue your conversation in Messages.</p>
    {connection.sharedResponses.length?<section aria-label="Shared starter responses"><h2>Previously shared answers</h2>{connection.sharedResponses.map(response=><article key={response.id}><p className={styles.eyebrow}>{response.author==="self"?"You":connection.partner.publicName} · version {response.version}</p><p className={styles.quote}>{response.text}</p></article>)}</section>:null}
    {connection.ownDraft?.text?<details><summary>Your saved private draft · only you</summary><p className={styles.quote}>{connection.ownDraft.text}</p><p>This draft has not been sent as a chat message.</p></details>:null}
  </details>;
}
