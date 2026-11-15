import styles from "@/app/journey/journey.module.scss";
import type { AlignmentItem } from "@/features/conversations/conversation.types";
import type { JourneySession } from "@/features/journey/journey.types";
import { alignmentBadge } from "./alignment";

function alignmentClassName(item: AlignmentItem): string {
  switch (item.trend) {
    case "still-shared":
      return styles.sharedBadge;
    case "new-shared":
      return styles.newSharedBadge;
    case "changed":
      return styles.changedBadge;
    case "worth-discussing":
      return styles.discussBadge;
    default:
      return item.aligned ? styles.sharedBadge : styles.discussBadge;
  }
}

export type AlignmentStageProps = {
  session: JourneySession;
};

export default function AlignmentStage({ session }: AlignmentStageProps) {
  return (
    <div className={styles.alignmentStack}>
      <section className={styles.alignmentHeader}>
        <div>
          <span className={styles.eyebrow}>WHAT YOU BOTH CHOSE TO SHARE</span>
          <h2>Where you are now.</h2>
          <p>
            This is a dated snapshot, not a score. Shared ground and differences can both
            change as your relationship changes.
          </p>
        </div>
        <span className={styles.alignmentMark}>↗</span>
      </section>

      {session.alignment.length ? (
        <div className={styles.alignmentGrid}>
          {session.alignment.map((item) => (
            <article className={styles.alignmentCard} key={item.key}>
              <span className={alignmentClassName(item)}>
                {alignmentBadge(item)}
              </span>
              <h3>{item.label}</h3>
              <div><span>You</span><strong>{item.ownAnswer}</strong></div>
              <div><span>{session.partnerState.name}</span><strong>{item.partnerAnswer}</strong></div>
              {item.ownContext || item.partnerContext ? (
                <div className={styles.sharedContext}>
                  {item.ownContext ? <p><span>You added</span>{item.ownContext}</p> : null}
                  {item.partnerContext ? <p><span>{session.partnerState.name} added</span>{item.partnerContext}</p> : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.noComparison}>
          You both kept your answers private. You can still choose a next conversation together.
        </div>
      )}

      <section className={styles.alignmentNextPrompt}>
        <div>
          <span className={styles.eyebrow}>NEXT</span>
          <h3>Turn insight into something you both choose.</h3>
          <p>Open the Roadmap to propose practical next steps, dates, and private follow-up reflections.</p>
        </div>
      </section>
    </div>
  );
}
