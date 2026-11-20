import type { DatePlanDecision, DatePlanEvent, DatePlanView } from "./date-plans.types";
import styles from "./chat.module.scss";

const headings: Record<DatePlanEvent["action"], string> = {
  propose: "Suggested date time", counter: "Suggested another time", confirm: "Date confirmed",
  decline: "Date suggestion declined", withdraw: "Date suggestion withdrawn", cancel: "Date canceled",
};

export default function DatePlanCard({ event, activePlan, busy, onAction, onCounter, onCalendar }: {
  event: DatePlanEvent; activePlan: DatePlanView | null; busy: boolean;
  onAction: (action: DatePlanDecision, plan: DatePlanView) => void;
  onCounter: (plan: DatePlanView) => void;
  onCalendar: (planId: string) => void;
}) {
  const isCurrent = activePlan?.id === event.id && activePlan.revision === event.revision && activePlan.state === event.state;
  const date = new Date(event.startsAt);
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const format = (zone: string) => date.toLocaleString(undefined, {
    timeZone: zone, weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  let original: string | undefined;
  if (event.timeZone !== localZone) {
    const zoneName = event.timeZone.replaceAll("_", " ");
    try { original = "Proposed as " + format(event.timeZone) + " (" + zoneName + ")"; }
    catch { original = "Original time zone: " + zoneName + ". Showing your local time."; }
  }

  return <section className={styles.planCard} aria-label={headings[event.action]}>
    <strong className={styles.planStatus} data-state={event.state}>{headings[event.action]}</strong>
    <p className={styles.venueName}>{event.venueName}</p>
    <time className={styles.planTime} dateTime={event.startsAt}>{format(localZone)}</time>
    {original ? <p className={styles.muted}>{original}</p> : null}
    {isCurrent && activePlan.state === "pending" ? <>
      {activePlan.proposer === "self" ? <>
        <p className={styles.muted}>Waiting for their reply</p>
        <button type="button" disabled={busy} onClick={() => onAction("withdraw", activePlan)}>Withdraw</button>
      </> : <div className={styles.planActions}>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => onAction("confirm", activePlan)}>Confirm</button>
        <button type="button" disabled={busy} onClick={() => onCounter(activePlan)}>Suggest another time</button>
        <button type="button" className={styles.quietAction} disabled={busy} onClick={() => onAction("decline", activePlan)}>Decline</button>
      </div>}
    </> : null}
    {isCurrent && activePlan.state === "confirmed" ? <>
      <div className={styles.planActions}>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => onCalendar(activePlan.id)}>Add to calendar</button>
        <button type="button" className={styles.quietAction} disabled={busy} onClick={() => onAction("cancel", activePlan)}>Cancel date</button>
      </div>
      <p className={styles.muted}>To reschedule, cancel and suggest a new time. Calendar copies won’t update automatically.</p>
    </> : null}
  </section>;
}
