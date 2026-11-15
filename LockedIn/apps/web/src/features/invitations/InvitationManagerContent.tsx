import type { SentInvitation, OwnedInvitationBlock } from "./invitation-management.types";
import managementStyles from "./invitation-management.module.scss";
const labels = { PENDING: "Invitation pending", ACCEPTED: "Invitation accepted", NOT_ACCEPTED: "Invitation not accepted", EXPIRED: "Invitation expired", WITHDRAWN: "Invitation withdrawn" };
export function SentInvitationCards({ items, busy, onWithdraw }: {
    items: SentInvitation[];
    busy: boolean;
    onWithdraw: (id: string) => void;
}) {
    return <ul className={managementStyles.list}>{items.map(item => <li key={item.id} className={managementStyles.card}>
    <span className={managementStyles.icon} aria-hidden>{item.status === "ACCEPTED" ? "✓" : "✉"}</span>
    <div><h3>{item.toEmail}</h3><span className={managementStyles.status}>{labels[item.status]}</span>
      <p>{item.status === "PENDING" ? "Awaiting a response. No action is needed from you." : item.status === "ACCEPTED" ? "A shared space was created from this invitation." : "No further action is needed on this invitation."}</p>
      <small>Created {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small>
      {item.canWithdraw && item.status === "PENDING" ? <button type="button" disabled={busy} onClick={() => onWithdraw(item.id)}>Withdraw invitation</button> : null}
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
