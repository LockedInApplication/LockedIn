import Link from "next/link";
import styles from "@/app/journey/journey.module.scss";
import { conversationTopicHref } from "../journey.navigation";
import type { JourneySession } from "../journey.types";

type MilestoneState = "complete" | "current" | "waiting" | "upcoming";

const stateLabels: Record<MilestoneState, string> = {
  complete: "Complete",
  current: "Current step",
  waiting: "Waiting",
  upcoming: "Up next",
};
const route = "M300 52 C300 105 178 96 178 174 C178 256 422 240 422 326 C422 410 178 390 178 478 C178 562 422 548 422 630 C422 690 344 704 300 724";
// Distance along the winding SVG route at each milestone.
const routeStops = [0, 15, 39, 63, 87, 100];

export default function SharedJourneyPath({ session, historyCount, partnerName, onViewConversations }: {
  session: JourneySession | null;
  historyCount: number;
  partnerName: string;
  onViewConversations: () => void;
}) {
  const bothAnswered = Boolean(session?.ownResponse && session.partnerState.submitted);
  const shared = Boolean(session?.bothRevealed);
  const steps = session?.nextSteps ?? [];
  const revisited = steps.length > 0 && steps.every(step => step.ownReflection && step.partnerReflection.submitted);
  const chapters = historyCount + (shared ? 1 : 0);

  const milestones: { title: string; detail: string; icon: string; state: MilestoneState }[] = [
    { title: "Connected", detail: `Your private space with ${partnerName}`, icon: "✓", state: "complete" },
    { title: "Pick a topic", detail: session?.topic ?? "Agree on something to talk about", icon: "◎", state: session ? "complete" : "current" },
    { title: "Reflect privately", detail: "Answer the questions on your own", icon: "✎", state: !session ? "upcoming" : bothAnswered ? "complete" : session.ownResponse ? "waiting" : "current" },
    { title: "Choose what to share", detail: "Share only the answers you both choose to reveal", icon: "↗", state: !bothAnswered ? "upcoming" : shared ? "complete" : session?.ownResponse?.revealConsented ? "waiting" : "current" },
    { title: "Agree on a next step", detail: "Make a plan you both want", icon: "◇", state: steps.length ? "complete" : shared ? "current" : "upcoming" },
    { title: "Revisit together", detail: "See how your plan went", icon: "↻", state: !steps.length ? "upcoming" : revisited ? "complete" : "current" },
  ];
  const current = milestones.findIndex(({ state }) => state === "current" || state === "waiting");
  const progress = routeStops[current] ?? 100;

  return (
    <section className={styles.journeyMap} aria-labelledby="journey-map-title">
      <Link className={styles.journeyMapHeader} href={conversationTopicHref} aria-labelledby="journey-map-title"
        onNavigate={event => { event.preventDefault(); onViewConversations(); }}>
        <div>
          <h2 id="journey-map-title">Shared progress</h2>
          <p>{chapters ? `${chapters} completed conversation${chapters === 1 ? "" : "s"}` : "Your first conversation starts with a topic."}</p>
        </div>
        <span className={styles.journeyMapChevron} aria-hidden="true">›</span>
      </Link>
      <div className={styles.pathCanvas}>
        <svg className={styles.pathSvg} viewBox="0 0 600 760" aria-hidden="true" focusable="false">
          <path className={styles.pathBase} d={route} pathLength="100" />
          <path className={styles.pathProgress} d={route} pathLength="100" strokeDashoffset={100 - progress} />
        </svg>
        <ol className={styles.milestoneList} role="list">
          {milestones.map(({ title, detail, icon, state }, index) => (
            <li key={title} data-state={state} aria-current={index === current ? "step" : undefined}>
              <span className={styles.milestoneNode} aria-hidden="true">{state === "complete" ? "✓" : icon}</span>
              <div className={styles.milestoneCopy}>
                <small>{stateLabels[state]}</small>
                <strong>{title}</strong>
                <p>{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
