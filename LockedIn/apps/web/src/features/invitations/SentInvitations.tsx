"use client";
import { useState } from "react";
import { useInvitationList } from "./use-invitation-list";
import { SentInvitationCards } from "./InvitationManagerContent";
import type { SentInvitation } from "./invitation-management.types";
import styles from "./sent-invitations.module.scss";

const filters = [
    { key: "ALL", label: "All" },
    { key: "PENDING", label: "Pending" },
    { key: "ACCEPTED", label: "Accepted" },
] as const;
type InvitationFilter = typeof filters[number]["key"];
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
    const [filter, setFilter] = useState<InvitationFilter>("ALL");
    const counts = { ALL: list.items.length, PENDING: 0, ACCEPTED: 0 };
    for (const { status } of list.items) {
        if (status === "PENDING" || status === "ACCEPTED") counts[status]++;
    }
    const visible = onViewAll ? list.items.slice(0, 3) : list.items.filter(item => filter === "ALL" || item.status === filter);
    const filterComplete = !list.loading && !list.error;

    return <section className={styles.panel} aria-labelledby="sent-invitations-title">
    <p className={styles.eyebrow}>Your invitations</p><h2 id="sent-invitations-title">A little clarity, without the chase.</h2>
    <p className={styles.intro}>Statuses update here quietly. Pending means the invitation was created, not that an email was delivered or opened.</p>
    {list.error ? <div role="alert"><p>{list.error}</p><button className={styles.pill} type="button" onClick={list.reload}>Try again</button></div> : null}
    {list.loading && !list.items.length ? <p role="status">Loading invitations…</p> : null}
    {filterComplete && !list.items.length ? <p>No invitations sent yet.</p> : null}
    {!onViewAll && list.items.length ? <>
        <div className={styles.filters} role="group" aria-label="Filter invitations">
            {filters.map(({ key, label }) => <button className={styles.pill} type="button" key={key}
                aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} <span>{counts[key]}</span></button>)}
        </div>
        {list.nextCursor ? <p className={styles.hint}>Filters and counts apply to loaded invitations. Load earlier invitations to see more.</p> : null}
        {filterComplete && !visible.length ? <p className={styles.hint} role="status">No {filter.toLowerCase()} invitations in the loaded history.</p> : null}
    </> : null}
    {onViewAll && (list.items.length > 3 || list.nextCursor) ? <p className={styles.hint}>Showing your three most recent invitations. Your full history is saved in Invitations.</p> : null}
    {visible.length ? <SentInvitationCards items={visible} busy={list.busy} onWithdraw={id => {
            if (window.confirm("Withdraw this pending invitation? Its link will stop working."))
                void list.mutate(`/api/journey/invites/${encodeURIComponent(id)}/withdraw`, "POST");
        }}/> : null}
    {onViewAll ? (list.items.length ? <button className={styles.pill} type="button" onClick={onViewAll}>View all invitations</button> : null) :
        list.nextCursor ? <button className={styles.pill} type="button" disabled={list.loading || list.busy} onClick={list.more}>Earlier invitations</button> : null}
  </section>;
}
