import type { SentInvitation, OwnedInvitationBlock } from "./invitation-management.types";
import managementStyles from "./invitation-management.module.scss";
import styles from "./sent-invitations.module.scss";
const labels = { PENDING: "Invitation pending", ACCEPTED: "Invitation accepted", NOT_ACCEPTED: "Invitation not accepted", EXPIRED: "Invitation expired", WITHDRAWN: "Invitation withdrawn" };
export function SentInvitationCards({ items, busy, onWithdraw }: {
    items: SentInvitation[];
    busy: boolean;
    onWithdraw: (id: string) => void;
}) {
    return <ul className={styles.list} role="list">{items.map(item => <li key={item.id} className={styles.row} data-status={item.status}>
    <span className={styles.icon} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
        {item.status === "ACCEPTED" ? <path d="m5 12 4 4 9-9" /> : item.status === "PENDING" ?
          <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></> :
          <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m4 7 8 6 8-6" /></>}
      </svg>
    </span>
    <div><div className={styles.rowTitle}><h3>{item.toEmail}</h3><span className={styles.status}>{labels[item.status]}</span></div>
      <p>{item.status === "PENDING" ? "Awaiting a response. No action is needed from you." : item.status === "ACCEPTED" ? "They accepted your invitation." : "No further action is needed on this invitation."}</p>
      <small>Created <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time></small>
      {item.canWithdraw && item.status === "PENDING" ? <button className={styles.pill} type="button" disabled={busy} onClick={() => onWithdraw(item.id)}>Withdraw invitation</button> : null}
    </div>
  </li>)}</ul>;
}
export function OwnedInvitationBlocks({ items, busy, onUnblock }: {
    items: OwnedInvitationBlock[];
    busy: boolean;
    onUnblock: (id: string) => void;
}) {
    return <div><p className={managementStyles.note}>Only you can remove these invitation blocks. Unblocking does not reconnect anyone or restore old invitations. A seven-day decline pause still applies if you declined.</p>
    <ul className={managementStyles.list}>{items.map(item => <li key={item.id} className={managementStyles.card}>
      <span className={managementStyles.icon} aria-hidden>◌</span><div><h3>{item.name}</h3><p>Invitations are blocked until you remove this setting.</p><button type="button" disabled={busy} onClick={() => onUnblock(item.id)}>Unblock invitations</button></div>
    </li>)}</ul>
  </div>;
}
