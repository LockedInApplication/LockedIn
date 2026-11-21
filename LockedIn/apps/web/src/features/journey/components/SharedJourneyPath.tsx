import styles from "@/app/journey/journey.module.scss";
import type { JourneySession } from "../journey.types";

type MilestoneState = "complete" | "current" | "waiting" | "upcoming";

const stateLabels: Record<MilestoneState, string> = {
  complete: "Complete",
  current: "Current step",
  waiting: "Waiting",
  upcoming: "Up next",
};

export default function SharedJourneyPath({ session, historyCount, partnerName }: {
  session: JourneySession | null;
  historyCount: number;
  partnerName: string;
}) {
  const bothAnswered = Boolean(session?.ownResponse && session.partnerState.submitted);
  const shared = Boolean(session?.bothRevealed);
  const steps = session?.nextSteps ?? [];
  const revisited = steps.length > 0 && steps.every(step => step.ownReflection && step.partnerReflection.submitted);
  const chapters = historyCount + (shared ? 1 : 0);

  const milestones: { title: string; detail: string; state: MilestoneState }[] = [
    { title: "Connected", detail: `Your private space with ${partnerName}`, state: "complete" },
    { title: "Pick a topic", detail: session?.topic ?? "Agree on something to talk about", state: session ? "complete" : "current" },
    { title: "Reflect privately", detail: "Answer the questions on your own", state: !session ? "upcoming" : bothAnswered ? "complete" : session.ownResponse ? "waiting" : "current" },
    { title: "Choose what to share", detail: "Share only the answers you both choose to reveal", state: !bothAnswered ? "upcoming" : shared ? "complete" : session?.ownResponse?.revealConsented ? "waiting" : "current" },
    { title: "Agree on a next step", detail: "Make a plan you both want", state: steps.length ? "complete" : shared ? "current" : "upcoming" },
    { title: "Revisit together", detail: "See how your plan went", state: !steps.length ? "upcoming" : revisited ? "complete" : "current" },
  ];
  const current = milestones.findIndex(({ state }) => state === "current" || state === "waiting");

  return (
    <section className={styles.journeyMap} aria-labelledby="journey-map-title">
      <header className={styles.journeyMapHeader}>
        <h2 id="journey-map-title">Shared progress</h2>
        <p>{chapters ? `${chapters} completed conversation${chapters === 1 ? "" : "s"}` : "Your first conversation starts with a topic."}</p>
      </header>
      <ol className={styles.milestoneList} role="list">
        {milestones.map(({ title, detail, state }, index) => (
          <li key={title} data-state={state} aria-current={index === current ? "step" : undefined}>
            <span className={styles.milestoneNode} aria-hidden="true">{state === "complete" ? "✓" : index + 1}</span>
            <div className={styles.milestoneCopy}>
              <strong>{title}</strong>
              <p>{detail}</p>
              <small>{stateLabels[state]}</small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
