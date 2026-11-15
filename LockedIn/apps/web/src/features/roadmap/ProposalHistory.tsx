"use client";

import styles from "@/app/journey/journey.module.scss";
import type { JourneySession } from "@/features/journey/journey.types";

export default function ProposalHistory({ session }: { session: JourneySession }) {
  return (
    <section className={styles.proposalHistory}>
      <span className={styles.eyebrow}>OTHER IDEAS YOU CONSIDERED</span>
      <h3>Nothing was silently discarded.</h3>
      <div>
        {session.proposalHistory.map((proposal) => (
          <article key={proposal.id}>
            <div>
              <strong>{proposal.title}</strong>
              <span>Proposed by {proposal.proposedByCurrentUser ? "you" : proposal.proposedByName}</span>
            </div>
            <span className={styles.historyStatus}>
              {proposal.status === "DECLINED" ? "Closed when another option was chosen" : "Earlier proposal"}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
