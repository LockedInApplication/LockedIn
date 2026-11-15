"use client";
import { useInvitationList } from "./use-invitation-list";
import { SentInvitationCards } from "./InvitationManagerContent";
import type { SentInvitation } from "./invitation-management.types";
import managementStyles from "./invitation-management.module.scss";
export default function SentInvitations({ revision = 0, onViewAll }: {
    revision?: number;
    onViewAll?: () => void;
}) {
    const list = useInvitationList<SentInvitation>("/api/journey/invites/sent", revision);
    return <SentInvitationsContent list={list} onViewAll={onViewAll}/>;
}

export function SentInvitationsContent({ list, onViewAll }: {
    list: ReturnType<typeof useInvitationList<SentInvitation>>;
    onViewAll?: () => void;
}) {
    return <section className={managementStyles.section} aria-labelledby="sent-invitations-title">
    <span className={managementStyles.kicker}>YOUR INVITATIONS</span><h2 id="sent-invitations-title">A little clarity, without the chase.</h2>
    <p className={managementStyles.note}>Statuses update here quietly. Pending means the invitation was created—not that an email was delivered or opened.</p>
    {list.error ? <div role="alert"><p>{list.error}</p><button type="button" onClick={list.reload}>Try again</button></div> : null}
    {list.loading && !list.items.length ? <p role="status">Loading invitations…</p> : null}
    {!list.loading && !list.error && !list.items.length ? <p>No invitations sent yet.</p> : null}
    {onViewAll && (list.items.length > 3 || list.nextCursor) ? <p className={managementStyles.note}>Showing your three most recent invitations. Your full history is saved in Invitations.</p> : null}
    <SentInvitationCards items={onViewAll ? list.items.slice(0, 3) : list.items} busy={list.busy} onWithdraw={id => {
            if (window.confirm("Withdraw this pending invitation? Its link will stop working."))
                void list.mutate(`/api/journey/invites/${encodeURIComponent(id)}/withdraw`, "POST");
        }}/>
    {onViewAll ? (list.items.length ? <button type="button" onClick={onViewAll}>View all invitations</button> : null) : list.nextCursor ? <button type="button" disabled={list.loading || list.busy} onClick={list.more}>Earlier invitations</button> : null}
  </section>;
}
