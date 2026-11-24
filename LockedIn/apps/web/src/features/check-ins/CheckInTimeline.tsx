import styles from "@/app/journey/journey.module.scss";
import type { JourneyOverview, JourneySession } from "@/features/journey/journey.types";
import { addDays, formatDate } from "@/features/journey/journey.utils";

export type CheckInTimelineProps = {
  partnerName: string;
  session: JourneySession | null;
  history: JourneyOverview["checkInHistory"];
  onChooseConversation: () => void;
};

export default function CheckInTimeline({
  partnerName,
  session,
  history,
  onChooseConversation,
}: CheckInTimelineProps) {
  return (
    <section className={styles.timelineCard}>
      <div className={styles.timelineHeader}>
        <div>
          <h2>Your shared ground over time.</h2>
          <p>
            Each check-in keeps only what you both chose to reveal at that time. Starting
            again always means fresh private answers and fresh sharing consent.
          </p>
        </div>
        {session?.bothRevealed ? (
          <div className={styles.checkInAction}>
            <button className={styles.primaryAction} onClick={onChooseConversation}>
              Choose another check-in
            </button>
            <span>Anytime, or gently revisit around {formatDate(addDays(session.createdAt, 90))}.</span>
          </div>
        ) : null}
      </div>

      <div className={styles.timelineList}>
        {session ? <article className={styles.currentChapter}>
          <span className={styles.timelineDot} aria-hidden="true" />
          <div>
            <span className={styles.currentLabel}>Current check-in</span>
            <h3>{session.topic}</h3>
            <p>
              {session.bothRevealed
                ? `Shared ${formatDate(session.createdAt)}. Your earlier check-ins remain unchanged below.`
                : `Started ${formatDate(session.createdAt)}. Nothing from this check-in is shared until both people consent.`}
            </p>
          </div>
        </article> : null}

        {history.map((snapshot) => (
          <article className={styles.pastChapter} key={snapshot.id}>
            <span className={styles.timelineDot} aria-hidden="true" />
            <div>
              <span className={styles.pastLabel}>Earlier check-in</span>
              <h3>{snapshot.topic}</h3>
              <p>Shared {formatDate(snapshot.revealedAt)}</p>
              {snapshot.alignment.length ? (
                <details>
                  <summary>
                    {snapshot.alignment.length} mutually revealed topic
                    {snapshot.alignment.length === 1 ? "" : "s"}
                  </summary>
                  <div className={styles.snapshotTopics}>
                    {snapshot.alignment.map((item) => (
                      <div key={item.key}>
                        <strong>{item.label}</strong>
                        <span>You · {item.ownAnswer}</span>
                        <span>{partnerName} · {item.partnerAnswer}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : (
                <p>No answers were mutually revealed in this check-in.</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
