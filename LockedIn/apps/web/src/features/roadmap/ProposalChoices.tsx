"use client";

import styles from "@/app/journey/journey.module.scss";
import type { JourneySession } from "@/features/journey/journey.types";
import { journeyRequest } from "@/features/journey/journey.client";
import { formatDate } from "@/features/journey/journey.utils";

export default function ProposalChoices({
  session,
  busy,
  runAction,
}: {
  session: JourneySession;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  return (
    <section className={styles.proposalBoard}>
      <div className={styles.proposalBoardHeader}>
        <span className={styles.eyebrow}>OPTIONS ON THE TABLE</span>
        <h2>Suggestions awaiting agreement.</h2>
        <p>Accepting a suggestion adds it to your roadmap. Other ideas stay available as separate next steps.</p>
      </div>
      <div className={styles.proposalGrid}>
        {session.proposals.map((proposal) => (
          <article id={`step-${encodeURIComponent(proposal.id)}`} tabIndex={-1} className={styles.proposalOption} key={proposal.id}>
            <span className={styles.proposerBadge}>
              {proposal.proposedByCurrentUser ? "Your proposal" : `${proposal.proposedByName}'s proposal`}
            </span>
            <h3>{proposal.title}</h3>
            {proposal.details ? <p>{proposal.details}</p> : null}
            {proposal.targetDate ? (
              <span className={styles.datePill}>Revisit · {formatDate(proposal.targetDate)}</span>
            ) : null}
            {proposal.proposedByCurrentUser ? (
              <div className={styles.pendingLine}>Waiting for {session.partnerState.name} to accept this step.</div>
            ) : (
              <button
                className={styles.primaryAction}
                disabled={busy}
                onClick={() =>
                  runAction(
                    () => journeyRequest(`/api/journey/next-steps/${proposal.id}/accept`, { method: "POST" }),
                    "This step was added to your shared roadmap.",
                  )
                }
              >
                {busy ? "Adding..." : "Add to our roadmap"}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
