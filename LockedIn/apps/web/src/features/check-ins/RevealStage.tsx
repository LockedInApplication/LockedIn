import styles from "@/app/journey/journey.module.scss";
import type { JourneySession } from "@/features/journey/journey.types";

export type RevealStageProps = {
  session: JourneySession;
  busy: boolean;
  onReveal: () => void;
};

export default function RevealStage({ session, busy, onReveal }: RevealStageProps) {
  const shared = session.questions.filter((question) => session.ownResponse?.shareKeys.includes(question.key));
  return (
    <section className={styles.focusCard}>
      <div className={styles.focusCopy}>
        <span className={styles.eyebrow}>REVEAL BY CHOICE</span>
        <h2>Both reflections are ready.</h2>
        <p>
          You selected {shared.length} answer{shared.length === 1 ? "" : "s"} for comparison.
          Unselected answers remain private. Once you continue, submitted answers can no longer be edited.
        </p>
        <ul className={styles.revealList}>
          {shared.length ? shared.map((question) => <li key={question.key}>✓ {question.label}</li>) : <li>No answers selected. You may still continue without a comparison.</li>}
        </ul>
      </div>
      <button className={styles.primaryAction} disabled={busy} onClick={onReveal}>
        {busy ? "Saving consent..." : "Consent and continue"}
      </button>
    </section>
  );
}
